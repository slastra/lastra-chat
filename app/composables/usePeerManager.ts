import type { SignalingMessage } from '../../shared/types/webrtc'

export type StreamType = 'webcam' | 'desktop'

export enum ConnectionState {
  IDLE = 'idle',
  REQUESTING = 'requesting',
  CREATING = 'creating', // New state for when connection is being created
  OFFERING = 'offering',
  ANSWERING = 'answering',
  CONNECTED = 'connected',
  FAILED = 'failed',
  CLOSED = 'closed'
}

interface PeerConnection {
  id: string
  localUserId: string
  remoteUserId: string
  remoteUserName: string
  streamType: StreamType
  role: 'sender' | 'receiver'
  state: ConnectionState
  connection: RTCPeerConnection
  createdAt: number
  lastActivity: number
}

interface PeerManagerOptions {
  onStreamReceived?: (userId: string, stream: MediaStream, streamType: StreamType) => void
  onStreamRemoved?: (userId: string, streamType: StreamType) => void
  sendSignal?: (message: Partial<SignalingMessage>) => void
}

export const usePeerManager = (options: PeerManagerOptions = {}) => {
  const { clientId, userName: _userName } = useUser()

  // Single map for all connections, keyed by connection ID
  const connections = ref<Map<string, PeerConnection>>(new Map())

  // Track connection state transitions to prevent invalid operations
  const stateTransitions = ref<Map<string, number>>(new Map())

  // Queue ICE candidates that arrive before connection is ready
  const pendingIceCandidates = ref<Map<string, RTCIceCandidate[]>>(new Map())

  // Track connections being created to prevent duplicates
  const connectionsInProgress = ref<Set<string>>(new Set())

  // Track pending answer processing to prevent race conditions
  const pendingAnswers = ref<Set<string>>(new Set())

  // Generate directional connection ID
  const getConnectionId = (remoteUserId: string, streamType: StreamType): string => {
    // Use directional IDs: localUser-to-remoteUser-streamType
    // This ensures separate connections for each direction
    return `${clientId.value}-to-${remoteUserId}-${streamType}`
  }

  // Generate reverse connection ID (for when remote user is sending to us)
  const getReverseConnectionId = (remoteUserId: string, streamType: StreamType): string => {
    return `${remoteUserId}-to-${clientId.value}-${streamType}`
  }

  // Get or check connection state
  const getConnectionState = (remoteUserId: string, streamType: StreamType): ConnectionState => {
    const id = getConnectionId(remoteUserId, streamType)
    const conn = connections.value.get(id)
    return conn?.state || ConnectionState.IDLE
  }

  // Get reverse connection state (for checking incoming connections)
  const getReverseConnectionState = (remoteUserId: string, streamType: StreamType): ConnectionState => {
    const id = getReverseConnectionId(remoteUserId, streamType)
    const conn = connections.value.get(id)
    return conn?.state || ConnectionState.IDLE
  }

  // Check if we can transition to a new state
  const canTransition = (currentState: ConnectionState, newState: ConnectionState): boolean => {
    const validTransitions: Record<ConnectionState, ConnectionState[]> = {
      [ConnectionState.IDLE]: [ConnectionState.REQUESTING, ConnectionState.CREATING, ConnectionState.OFFERING, ConnectionState.ANSWERING],
      [ConnectionState.REQUESTING]: [ConnectionState.OFFERING, ConnectionState.FAILED, ConnectionState.CLOSED],
      [ConnectionState.CREATING]: [ConnectionState.OFFERING, ConnectionState.ANSWERING, ConnectionState.FAILED, ConnectionState.CLOSED],
      [ConnectionState.OFFERING]: [ConnectionState.CONNECTED, ConnectionState.FAILED, ConnectionState.CLOSED],
      [ConnectionState.ANSWERING]: [ConnectionState.CONNECTED, ConnectionState.FAILED, ConnectionState.CLOSED],
      [ConnectionState.CONNECTED]: [ConnectionState.CLOSED, ConnectionState.FAILED],
      [ConnectionState.FAILED]: [ConnectionState.IDLE, ConnectionState.CLOSED],
      [ConnectionState.CLOSED]: [ConnectionState.IDLE]
    }

    return validTransitions[currentState]?.includes(newState) || false
  }

  // Update connection state with validation
  const updateConnectionState = (id: string, newState: ConnectionState): boolean => {
    const conn = connections.value.get(id)
    if (!conn) {
      console.warn(`[PeerManager] Cannot update state: connection ${id} not found`)
      return false
    }

    if (!canTransition(conn.state, newState)) {
      console.warn(`[PeerManager] Invalid state transition: ${conn.state} -> ${newState} for ${id}`)
      return false
    }

    conn.state = newState
    conn.lastActivity = Date.now()

    // Track state transition count for debugging
    const count = stateTransitions.value.get(id) || 0
    stateTransitions.value.set(id, count + 1)

    return true
  }

  // Get ICE servers from runtime config
  const getIceServers = async (): Promise<RTCIceServer[]> => {
    const config = useRuntimeConfig()
    const servers: RTCIceServer[] = []

    // Add STUN server if configured
    if (config.public.stunUrl) {
      servers.push({ urls: config.public.stunUrl as string })
    }

    // Add TURN server if configured
    if (config.public.turnUrl && config.public.turnUsername && config.public.turnCredential) {
      servers.push({
        urls: config.public.turnUrl as string,
        username: config.public.turnUsername as string,
        credential: config.public.turnCredential as string
      })
    }

    // Fallback to Google STUN if no servers configured
    if (servers.length === 0) {
      servers.push({ urls: 'stun:stun.l.google.com:19302' })
    }

    return servers
  }

  // Create a new peer connection
  const createConnection = async (
    remoteUserId: string,
    remoteUserName: string,
    streamType: StreamType,
    role: 'sender' | 'receiver',
    connectionId?: string
  ): Promise<PeerConnection> => {
    const id = connectionId || getConnectionId(remoteUserId, streamType)

    // Check if connection already exists
    const existing = connections.value.get(id)
    if (existing && existing.state !== ConnectionState.CLOSED && existing.state !== ConnectionState.FAILED) {
      return existing
    }

    // Clean up old connection if it exists
    if (existing) {
      await closeConnection(remoteUserId, streamType)
    }

    const iceServers = await getIceServers()
    const pc = new RTCPeerConnection({
      iceServers,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    })

    const connection: PeerConnection = {
      id,
      localUserId: clientId.value,
      remoteUserId,
      remoteUserName,
      streamType,
      role,
      state: ConnectionState.IDLE,
      connection: pc,
      createdAt: Date.now(),
      lastActivity: Date.now()
    }

    // Set up event handlers
    pc.onicecandidate = (event) => {
      if (event.candidate && options.sendSignal) {
        options.sendSignal({
          type: 'ice-candidate',
          targetUserId: remoteUserId,
          streamType,
          candidate: event.candidate
        })
      }
    }

    pc.ontrack = (event) => {
      if (role === 'receiver' && event.streams?.[0]) {
        options.onStreamReceived?.(remoteUserId, event.streams[0], streamType)
      }
    }

    pc.onconnectionstatechange = () => {
      // Don't update state if connection is already in a terminal state
      const currentConn = connections.value.get(id)
      if (currentConn && (currentConn.state === ConnectionState.FAILED || currentConn.state === ConnectionState.CLOSED)) {
        return
      }

      if (pc.connectionState === 'connected') {
        // Only update if not already connected (prevents connected -> connected transition)
        if (currentConn && currentConn.state !== ConnectionState.CONNECTED) {
          updateConnectionState(id, ConnectionState.CONNECTED)
        }
      } else if (pc.connectionState === 'failed') {
        updateConnectionState(id, ConnectionState.FAILED)
        options.onStreamRemoved?.(remoteUserId, streamType)
        // Clean up immediately on failure
        connectionsInProgress.value.delete(id)
        pendingIceCandidates.value.delete(id)
        // Close the connection immediately
        setTimeout(() => closeConnection(remoteUserId, streamType), 100)
      } else if (pc.connectionState === 'closed') {
        updateConnectionState(id, ConnectionState.CLOSED)
        options.onStreamRemoved?.(remoteUserId, streamType)
        connectionsInProgress.value.delete(id)
        pendingIceCandidates.value.delete(id)
      }
    }

    pc.oniceconnectionstatechange = () => {
    }

    connections.value.set(id, connection)
    return connection
  }

  // Request a stream from a remote user
  const requestStream = async (remoteUserId: string, streamType: StreamType): Promise<void> => {
    // We're requesting THEM to send to US, so use reverse ID for the incoming connection
    const id = getReverseConnectionId(remoteUserId, streamType)

    // Check if incoming connection already exists
    const conn = connections.value.get(id)

    // Check if we can request
    if (conn && conn.state !== ConnectionState.IDLE && conn.state !== ConnectionState.FAILED && conn.state !== ConnectionState.CLOSED) {
      return
    }

    // Update state to prevent duplicate requests
    if (conn) {
      updateConnectionState(id, ConnectionState.REQUESTING)
    } else {
      // Create placeholder for INCOMING connection
      const placeholder: PeerConnection = {
        id,
        localUserId: clientId.value,
        remoteUserId,
        remoteUserName: 'Unknown',
        streamType,
        role: 'receiver',
        state: ConnectionState.REQUESTING,
        connection: null as unknown as RTCPeerConnection, // Will be created when offer arrives
        createdAt: Date.now(),
        lastActivity: Date.now()
      }
      connections.value.set(id, placeholder)
    }

    // Send request signal
    options.sendSignal?.({
      type: 'request-stream',
      targetUserId: remoteUserId,
      streamType
    })
  }

  // Create and send an offer
  const createOffer = async (
    remoteUserId: string,
    remoteUserName: string,
    streamType: StreamType,
    localStream: MediaStream
  ): Promise<void> => {
    const id = getConnectionId(remoteUserId, streamType)

    // Check if we're already creating this connection
    if (connectionsInProgress.value.has(id)) {
      return
    }

    // Check if connection exists and is active
    let conn: PeerConnection | undefined = connections.value.get(id)
    if (conn && conn.state !== ConnectionState.CLOSED && conn.state !== ConnectionState.FAILED) {
      return
    }

    // Mark as in progress
    connectionsInProgress.value.add(id)

    try {
      // Create new connection
      const newConn = await createConnection(remoteUserId, remoteUserName, streamType, 'sender')
      conn = newConn

      // Check state
      if (!canTransition(conn.state, ConnectionState.OFFERING)) {
        connectionsInProgress.value.delete(id)
        return
      }

      updateConnectionState(id, ConnectionState.OFFERING)

      // Add tracks to the connection
      localStream.getTracks().forEach((track) => {
        conn!.connection.addTrack(track, localStream)
      })

      // Create and send offer
      const offer = await conn!.connection.createOffer()
      await conn!.connection.setLocalDescription(offer)

      options.sendSignal?.({
        type: 'offer',
        targetUserId: remoteUserId,
        streamType,
        offer: {
          type: offer.type,
          sdp: offer.sdp
        }
      })
    } catch (error) {
      console.error(`[PeerManager] Failed to create offer for ${id}:`, error)
      updateConnectionState(id, ConnectionState.FAILED)
    } finally {
      // Always remove from in-progress
      connectionsInProgress.value.delete(id)
    }
  }

  // Handle incoming offer
  const handleOffer = async (
    message: SignalingMessage,
    localStream?: MediaStream
  ): Promise<void> => {
    console.log(`[PeerManager] handleOffer: ENTRY - Received offer from ${message.userId} for ${message.streamType}`)

    if (!message.offer || !message.streamType) {
      console.log(`[PeerManager] handleOffer: Missing offer or streamType, returning`)
      return
    }

    // When receiving an offer, it's for THEIR connection to US (reverse ID)
    const reverseId = getReverseConnectionId(message.userId, message.streamType)
    console.log(`[PeerManager] handleOffer: Reverse ID: ${reverseId}`)
    console.log(`[PeerManager] handleOffer: We have local stream: ${!!localStream}`)

    // Check if this is a response to our stream request
    const existingRequest = connections.value.get(reverseId)
    console.log(`[PeerManager] handleOffer: Existing connection found: ${!!existingRequest}`)
    if (existingRequest) {
      console.log(`[PeerManager] handleOffer: Existing connection state: ${existingRequest.state}`)
      console.log(`[PeerManager] handleOffer: Existing connection role: ${existingRequest.role}`)
    }

    let conn: PeerConnection
    const id: string = reverseId

    if (existingRequest && existingRequest.state === ConnectionState.REQUESTING) {
      // This is a response to our request - use the placeholder connection
      console.log(`[PeerManager] handleOffer: BRANCH 1 - Response to our request, replacing placeholder`)
      conn = existingRequest

      // We requested their stream, so we're the receiver
      // Even if we have a local stream to send back (for bidirectional communication)
      const role = 'receiver'
      console.log(`[PeerManager] handleOffer: Creating real connection with role: ${role} (we requested their stream)`)

      // Delete placeholder and create real connection with same ID
      connections.value.delete(id)
      conn = await createConnection(message.userId, message.userName || 'Unknown', message.streamType, role, id)
      console.log(`[PeerManager] handleOffer: Real connection created successfully`)
    } else {
      console.log(`[PeerManager] handleOffer: BRANCH 2 - Not a response to request`)

      // This is an unsolicited offer - check if connection already exists
      if (existingRequest && existingRequest.state !== ConnectionState.CLOSED && existingRequest.state !== ConnectionState.FAILED) {
        console.log(`[PeerManager] handleOffer: ERROR - Connection ${id} already exists in state ${existingRequest.state}, IGNORING OFFER`)
        return
      }

      // Create new connection
      const role = localStream ? 'sender' : 'receiver'
      console.log(`[PeerManager] handleOffer: Creating new connection for unsolicited offer, role: ${role}`)
      conn = await createConnection(message.userId, message.userName || 'Unknown', message.streamType, role, id)
      console.log(`[PeerManager] handleOffer: New connection created successfully`)
    }

    if (!conn) {
      console.log(`[PeerManager] handleOffer: ERROR - Failed to create connection, returning`)
      return
    }

    console.log(`[PeerManager] handleOffer: Updating state to ANSWERING`)
    updateConnectionState(id, ConnectionState.ANSWERING)

    try {
      // If we have a local stream (we're also broadcasting), add tracks
      if (localStream) {
        const trackCount = localStream.getTracks().length
        console.log(`[PeerManager] handleOffer: Adding ${trackCount} local tracks to send back`)
        localStream.getTracks().forEach((track) => {
          conn!.connection.addTrack(track, localStream)
        })
      } else {
        console.log(`[PeerManager] handleOffer: No local stream, receiving only`)
      }

      // Set remote description and create answer
      await conn.connection.setRemoteDescription(new RTCSessionDescription(message.offer))
      const answer = await conn.connection.createAnswer()
      await conn.connection.setLocalDescription(answer)

      // Process any pending ICE candidates
      const pending = pendingIceCandidates.value.get(id)
      if (pending && pending.length > 0) {
        console.log(`[PeerManager] handleOffer: Processing ${pending.length} pending ICE candidates`)
        for (const candidate of pending) {
          try {
            await conn.connection.addIceCandidate(candidate)
          } catch (error) {
            console.error(`[PeerManager] Failed to add pending ICE candidate:`, error)
          }
        }
        pendingIceCandidates.value.delete(id)
      }

      console.log(`[PeerManager] handleOffer: Sending answer to ${message.userId}`)
      options.sendSignal?.({
        type: 'answer',
        targetUserId: message.userId,
        streamType: message.streamType,
        answer: {
          type: answer.type,
          sdp: answer.sdp
        }
      })
      console.log(`[PeerManager] handleOffer: Answer sent successfully`)
    } catch (error) {
      console.error(`[PeerManager] handleOffer: Failed to handle offer for ${id}:`, error)
      updateConnectionState(id, ConnectionState.FAILED)
    }
  }

  // Handle incoming answer
  const handleAnswer = async (message: SignalingMessage): Promise<void> => {
    if (!message.answer || !message.streamType) return

    const id = getConnectionId(message.userId, message.streamType)

    // Check if we're already processing an answer for this connection
    if (pendingAnswers.value.has(id)) {
      return
    }

    const conn = connections.value.get(id)

    if (!conn) {
      console.warn(`[PeerManager] No connection found for answer ${id}`)
      return
    }

    // Check if connection is in a terminal state
    if (conn.state === ConnectionState.CONNECTED
      || conn.state === ConnectionState.FAILED
      || conn.state === ConnectionState.CLOSED) {
      return
    }

    // Check signaling state to prevent duplicate answer errors
    if (conn.connection.signalingState !== 'have-local-offer') {
      return
    }

    if (conn.state !== ConnectionState.OFFERING) {
      return
    }

    // Mark this answer as being processed
    pendingAnswers.value.add(id)
    console.log(`[PeerManager] handleAnswer: Processing answer for ${id}`)

    try {
      console.log(`[PeerManager] handleAnswer: Setting remote description for ${id}`)
      await conn.connection.setRemoteDescription(new RTCSessionDescription(message.answer))
      console.log(`[PeerManager] handleAnswer: Remote description set successfully for ${id}`)

      // Update state to CONNECTED after successfully applying answer
      updateConnectionState(id, ConnectionState.CONNECTED)

      // Process any pending ICE candidates now that remote description is set
      const pending = pendingIceCandidates.value.get(id)
      if (pending && pending.length > 0) {
        console.log(`[PeerManager] handleAnswer: Processing ${pending.length} pending ICE candidates for ${id}`)
        for (const candidate of pending) {
          try {
            await conn.connection.addIceCandidate(candidate)
          } catch (error) {
            console.error(`[PeerManager] Failed to add pending ICE candidate:`, error)
          }
        }
        pendingIceCandidates.value.delete(id)
      }
    } catch (error) {
      console.error(`[PeerManager] Failed to apply answer for ${id}:`, error)
      updateConnectionState(id, ConnectionState.FAILED)
      connectionsInProgress.value.delete(id)
    } finally {
      // Always remove from pending set
      pendingAnswers.value.delete(id)
      console.log(`[PeerManager] handleAnswer: Finished processing answer for ${id}`)
    }
  }

  // Handle incoming ICE candidate
  const handleIceCandidate = async (message: SignalingMessage): Promise<void> => {
    if (!message.candidate || !message.streamType) return

    // ICE candidates can be for either direction, check both
    const outgoingId = getConnectionId(message.userId, message.streamType)
    const incomingId = getReverseConnectionId(message.userId, message.streamType)

    let conn = connections.value.get(outgoingId)
    let id = outgoingId

    if (!conn) {
      conn = connections.value.get(incomingId)
      id = incomingId
    }
    const candidate = new RTCIceCandidate(message.candidate)

    if (!conn || !conn.connection) {
      // Queue the candidate if connection doesn't exist yet
      const pending = pendingIceCandidates.value.get(id) || []
      pending.push(candidate)
      pendingIceCandidates.value.set(id, pending)
      return
    }

    // Check if remote description is set (like webcam-test does)
    if (!conn.connection.remoteDescription) {
      // Queue the candidate if remote description not set
      const pending = pendingIceCandidates.value.get(id) || []
      pending.push(candidate)
      pendingIceCandidates.value.set(id, pending)
      return
    }

    try {
      await conn.connection.addIceCandidate(candidate)
    } catch (error) {
      console.error(`[PeerManager] Failed to add ICE candidate for ${id}:`, error)
    }
  }

  // Close a connection
  const closeConnection = async (remoteUserId: string, streamType: StreamType): Promise<void> => {
    const id = getConnectionId(remoteUserId, streamType)
    const conn = connections.value.get(id)

    if (!conn) return

    // Close RTCPeerConnection if it exists
    if (conn.connection && typeof conn.connection.close === 'function') {
      conn.connection.close()
    }

    // Remove from connections map and clean up
    connections.value.delete(id)
    stateTransitions.value.delete(id)
    pendingIceCandidates.value.delete(id)

    // Notify stream removed
    options.onStreamRemoved?.(remoteUserId, streamType)
  }

  // Close all connections
  const closeAllConnections = async (): Promise<void> => {
    for (const conn of connections.value.values()) {
      if (conn.connection && typeof conn.connection.close === 'function') {
        conn.connection.close()
      }
      options.onStreamRemoved?.(conn.remoteUserId, conn.streamType)
    }

    connections.value.clear()
    stateTransitions.value.clear()
    pendingIceCandidates.value.clear()
    connectionsInProgress.value.clear()
    pendingAnswers.value.clear()
  }

  // Get active connections
  const getActiveConnections = () => {
    return Array.from(connections.value.values()).filter(
      conn => conn.state === ConnectionState.CONNECTED
    )
  }

  // Get active connections by role and stream type
  const getActiveConnectionsByRole = (role: 'sender' | 'receiver', streamType?: StreamType) => {
    return Array.from(connections.value.values()).filter(
      conn => conn.state === ConnectionState.CONNECTED
        && conn.role === role
        && (streamType ? conn.streamType === streamType : true)
    )
  }

  // Clean up stale connections (older than 30 seconds without activity)
  const cleanupStaleConnections = () => {
    const now = Date.now()
    const staleThreshold = 30000 // 30 seconds

    for (const [_id, conn] of connections.value.entries()) {
      if (
        conn.state === ConnectionState.FAILED
        || (conn.state !== ConnectionState.CONNECTED && now - conn.lastActivity > staleThreshold)
      ) {
        closeConnection(conn.remoteUserId, conn.streamType)
      }
    }
  }

  // Set up periodic cleanup
  const cleanupInterval = setInterval(cleanupStaleConnections, 10000) // Every 10 seconds

  // Cleanup on unmount
  onUnmounted(() => {
    clearInterval(cleanupInterval)
    closeAllConnections()
  })

  return {
    // State queries
    getConnectionState,
    getReverseConnectionState,
    getActiveConnections,
    getActiveConnectionsByRole,

    // Connection management
    requestStream,
    createOffer,
    closeConnection,
    closeAllConnections,

    // Signal handlers
    handleOffer,
    handleAnswer,
    handleIceCandidate,

    // Debugging
    connections: readonly(connections),
    stateTransitions: readonly(stateTransitions)
  }
}
