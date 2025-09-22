import { useDisplayMedia } from '@vueuse/core'
import type { TestSignalMessage } from '../../shared/types/webrtc'

interface _TestPeer {
  id: string
  role: 'sharer' | 'viewer'
  connection: RTCPeerConnection
  dataChannel?: RTCDataChannel
}

export const useScreenShareTest = () => {
  // Use persistent state to survive refreshes
  const testId = useState('screenShareTestId', () => Math.random().toString(36).substring(7))
  const roomId = useState('screenShareRoomId', () => '')
  const role = useState<'idle' | 'sharer' | 'viewer'>('screenShareRole', () => 'idle')
  const isConnected = ref(false)
  const connectionState = ref<RTCPeerConnectionState>('new')
  const iceConnectionState = ref<RTCIceConnectionState>('new')

  // WebRTC state persistence
  const webrtcState = useWebRTCState()
  const sessionId = `screen-share-test-${testId.value}`

  const { stream: displayStream, start: startCapture, stop: stopCapture } = useDisplayMedia({
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 }
    },
    audio: false
  })

  const localStream = ref<MediaStream | null>(null)
  const remoteStream = ref<MediaStream | null>(null)
  const peerConnection = ref<RTCPeerConnection | null>(null)
  const dataChannel = ref<RTCDataChannel | null>(null)

  // Use persistent state for interval management to prevent memory leaks
  const activeIntervals = useState<Map<string, NodeJS.Timeout>>('screenShareIntervals', () => new Map())
  const pollingInterval = ref<NodeJS.Timeout | null>(null)

  const debugLogs = ref<Array<{ time: string, message: string, type: 'info' | 'error' | 'success' }>>([])
  const stats = ref({
    bitrate: 0,
    framerate: 0,
    resolution: '',
    packetsLost: 0,
    jitter: 0,
    roundTripTime: 0
  })

  const addDebugLog = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    const time = new Date().toLocaleTimeString()
    debugLogs.value.unshift({ time, message, type })
    if (debugLogs.value.length > 100) {
      debugLogs.value.pop()
    }
    console.log(`[ScreenShareTest] ${message}`)
  }

  // Generate TURN credentials
  const generateTurnCredentials = async (secret: string) => {
    const unixTimestamp = Math.floor(Date.now() / 1000) + 24 * 3600
    const username = `${unixTimestamp}:${testId.value}`

    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    )

    const messageData = encoder.encode(username)
    const signature = await crypto.subtle.sign('HMAC', key, messageData)
    const password = btoa(String.fromCharCode(...new Uint8Array(signature)))

    return { username, password }
  }

  const getIceServers = async (): Promise<RTCIceServer[]> => {
    const staticAuthSecret = 'f7a8c3d9e2b5a4f1c6d8e9b0a2c4d6e8f0a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1'
    const { username, password } = await generateTurnCredentials(staticAuthSecret)

    return [
      { urls: 'stun:turn.lastra.us:3478' },
      {
        urls: [
          'turn:turn.lastra.us:3478?transport=udp',
          'turn:turn.lastra.us:3478?transport=tcp'
        ],
        username,
        credential: password
      },
      {
        urls: 'turns:turn.lastra.us:5349?transport=tcp',
        username,
        credential: password
      }
    ]
  }

  // Send message through API
  const sendMessage = async (message: TestSignalMessage) => {
    try {
      await $fetch('/api/screen-share-test/signal', {
        method: 'POST',
        body: message
      })
    } catch (error) {
      addDebugLog(`Failed to send message: ${error}`, 'error')
    }
  }

  // Poll for messages
  const pollMessages = async () => {
    if (!roomId.value) return

    try {
      const messages = await $fetch(`/api/screen-share-test/messages`, {
        query: {
          roomId: roomId.value,
          clientId: testId.value
        }
      })

      if (Array.isArray(messages)) {
        for (const msg of messages) {
          await handleMessage(msg as TestSignalMessage)
        }
      }
    } catch {
      // Silent fail for polling
    }
  }

  // Handle incoming messages
  const handleMessage = async (message: TestSignalMessage) => {
    if (message.senderId === testId.value) return // Ignore own messages

    switch (message.type) {
      case 'offer':
        if (role.value === 'viewer' && message.data?.offer) {
          await handleOffer(message.data.offer)
        }
        break
      case 'answer':
        if (role.value === 'sharer' && message.data?.answer) {
          await handleAnswer(message.data.answer)
        }
        break
      case 'ice-candidate':
        if (message.data?.candidate) {
          await handleIceCandidate(message.data.candidate)
        }
        break
      case 'share-start':
        addDebugLog('Remote user started sharing', 'info')
        break
      case 'share-stop':
        addDebugLog('Remote user stopped sharing', 'info')
        if (role.value === 'viewer') {
          await stopViewing()
        }
        break
    }
  }

  // Create peer connection
  const createPeerConnection = async () => {
    const iceServers = await getIceServers()

    peerConnection.value = new RTCPeerConnection({
      iceServers,
      iceTransportPolicy: 'all'
    })

    // Set up event handlers
    peerConnection.value.onicecandidate = (event) => {
      if (event.candidate) {
        addDebugLog(`ICE candidate: ${event.candidate.type} - ${event.candidate.protocol}`, 'info')
        sendMessage({
          type: 'ice-candidate',
          roomId: roomId.value,
          senderId: testId.value,
          data: { candidate: event.candidate }
        })
      }
    }

    peerConnection.value.onconnectionstatechange = () => {
      if (peerConnection.value) {
        connectionState.value = peerConnection.value.connectionState
        addDebugLog(`Connection state: ${connectionState.value}`,
          connectionState.value === 'connected' ? 'success' : 'info')

        // Update persistent state
        webrtcState.updateSession(sessionId, {
          connectionState: connectionState.value,
          isSharing: role.value === 'sharer' && connectionState.value === 'connected',
          isViewing: role.value === 'viewer' && connectionState.value === 'connected'
        })

        if (connectionState.value === 'connected') {
          isConnected.value = true
          startStatsCollection()
        } else if (connectionState.value === 'failed' || connectionState.value === 'closed') {
          isConnected.value = false
          stopStatsCollection()
        }
      }
    }

    peerConnection.value.oniceconnectionstatechange = () => {
      if (peerConnection.value) {
        iceConnectionState.value = peerConnection.value.iceConnectionState
        addDebugLog(`ICE connection state: ${iceConnectionState.value}`, 'info')
      }
    }

    peerConnection.value.ontrack = (event) => {
      addDebugLog('Received remote stream', 'success')
      remoteStream.value = event.streams[0] || null
    }

    // Create data channel for additional communication
    if (role.value === 'sharer') {
      dataChannel.value = peerConnection.value.createDataChannel('test-channel')
      setupDataChannel(dataChannel.value)
    } else {
      peerConnection.value.ondatachannel = (event) => {
        dataChannel.value = event.channel
        setupDataChannel(dataChannel.value)
      }
    }
  }

  const setupDataChannel = (channel: RTCDataChannel) => {
    channel.onopen = () => {
      addDebugLog('Data channel opened', 'success')
    }
    channel.onmessage = (event) => {
      addDebugLog(`Data channel message: ${event.data}`, 'info')
    }
    channel.onclose = () => {
      addDebugLog('Data channel closed', 'info')
    }
  }

  // Start sharing
  const startSharing = async () => {
    if (!roomId.value) {
      addDebugLog('Please enter a room ID', 'error')
      return
    }

    try {
      await startCapture()
      if (!displayStream.value) {
        throw new Error('Failed to capture display')
      }

      localStream.value = displayStream.value
      role.value = 'sharer'

      await joinRoom()
      await createPeerConnection()

      // Add tracks to peer connection
      localStream.value.getTracks().forEach((track) => {
        peerConnection.value!.addTrack(track, localStream.value!)
      })

      // Create and send offer
      const offer = await peerConnection.value!.createOffer()
      await peerConnection.value!.setLocalDescription(offer)

      await sendMessage({
        type: 'offer',
        roomId: roomId.value,
        senderId: testId.value,
        data: { offer }
      })

      await sendMessage({
        type: 'share-start',
        roomId: roomId.value,
        senderId: testId.value
      })

      addDebugLog('Started sharing, waiting for viewer...', 'success')

      // Handle stream end
      displayStream.value.getVideoTracks().forEach((track) => {
        track.onended = () => {
          stopSharing()
        }
      })
    } catch (error) {
      addDebugLog(`Failed to start sharing: ${error}`, 'error')
      role.value = 'idle'
    }
  }

  // Start viewing
  const startViewing = async () => {
    if (!roomId.value) {
      addDebugLog('Please enter a room ID', 'error')
      return
    }

    try {
      role.value = 'viewer'
      await joinRoom()
      addDebugLog('Joined room as viewer, waiting for stream...', 'info')
    } catch (error) {
      addDebugLog(`Failed to start viewing: ${error}`, 'error')
      role.value = 'idle'
    }
  }

  // Handle offer (as viewer)
  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    addDebugLog('Received offer from sharer', 'info')

    await createPeerConnection()
    await peerConnection.value!.setRemoteDescription(offer)

    const answer = await peerConnection.value!.createAnswer()
    await peerConnection.value!.setLocalDescription(answer)

    await sendMessage({
      type: 'answer',
      roomId: roomId.value,
      senderId: testId.value,
      data: { answer }
    })

    addDebugLog('Sent answer to sharer', 'success')
  }

  // Handle answer (as sharer)
  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    addDebugLog('Received answer from viewer', 'info')
    await peerConnection.value!.setRemoteDescription(answer)
  }

  // Handle ICE candidate
  const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
    if (peerConnection.value && peerConnection.value.remoteDescription) {
      await peerConnection.value.addIceCandidate(candidate)
      addDebugLog(`Added ICE candidate`, 'info')
    }
  }

  // Initialize session and check for reconnection
  const initializeSession = () => {
    // Create or get session state
    if (!webrtcState.getCurrentSession()) {
      webrtcState.createSession(sessionId, {
        roomId: roomId.value,
        role: role.value
      })
    }

    // Check if we should attempt reconnection
    if (webrtcState.shouldReconnect(sessionId)) {
      const reconnectionInfo = webrtcState.getReconnectionInfo(sessionId)
      if (reconnectionInfo && reconnectionInfo.roomId) {
        addDebugLog(`Attempting to reconnect to room: ${reconnectionInfo.roomId}`, 'info')
        roomId.value = reconnectionInfo.roomId

        // Restore previous role if it was active
        if (reconnectionInfo.role !== 'idle') {
          role.value = reconnectionInfo.role

          // Attempt to restore connection
          setTimeout(() => {
            if (role.value === 'sharer') {
              startSharing()
            } else if (role.value === 'viewer') {
              startViewing()
            }
          }, 1000)
        }
      }
    }
  }

  // Call initialization on mount or immediately if not in component
  onMounted(() => {
    initializeSession()
  })

  // Join room
  const joinRoom = async () => {
    await $fetch('/api/screen-share-test/join', {
      method: 'POST',
      body: {
        roomId: roomId.value,
        clientId: testId.value,
        role: role.value
      }
    })

    // Start polling for messages with proper cleanup
    const intervalKey = `polling-${roomId.value}-${testId.value}`

    // Clear any existing interval for this room
    const existingInterval = activeIntervals.value.get(intervalKey)
    if (existingInterval) {
      clearInterval(existingInterval)
    }

    if (!pollingInterval.value) {
      pollingInterval.value = setInterval(pollMessages, 1000)
      activeIntervals.value.set(intervalKey, pollingInterval.value)
    }

    addDebugLog(`Joined room: ${roomId.value}`, 'success')
  }

  // Stop sharing
  const stopSharing = async () => {
    stopCapture()

    if (peerConnection.value) {
      peerConnection.value.close()
      peerConnection.value = null
    }

    await sendMessage({
      type: 'share-stop',
      roomId: roomId.value,
      senderId: testId.value
    })

    await leaveRoom()

    localStream.value = null
    role.value = 'idle'
    isConnected.value = false

    addDebugLog('Stopped sharing', 'info')
  }

  // Stop viewing
  const stopViewing = async () => {
    if (peerConnection.value) {
      peerConnection.value.close()
      peerConnection.value = null
    }

    await leaveRoom()

    remoteStream.value = null
    role.value = 'idle'
    isConnected.value = false

    addDebugLog('Stopped viewing', 'info')
  }

  // Leave room
  const leaveRoom = async () => {
    const intervalKey = `polling-${roomId.value}-${testId.value}`

    if (pollingInterval.value) {
      clearInterval(pollingInterval.value)
      pollingInterval.value = null
      activeIntervals.value.delete(intervalKey)
    }

    try {
      await $fetch('/api/screen-share-test/leave', {
        method: 'POST',
        body: {
          roomId: roomId.value,
          clientId: testId.value
        }
      })
    } catch {
      // Silent fail
    }
  }

  // Stats collection
  let statsInterval: NodeJS.Timeout | null = null

  const startStatsCollection = () => {
    if (statsInterval) return

    statsInterval = setInterval(async () => {
      if (!peerConnection.value) return

      const statsReport = await peerConnection.value.getStats()
      statsReport.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
          stats.value.bitrate = Math.round(report.bytesReceived * 8 / 1000)
          stats.value.framerate = report.framesPerSecond || 0
          stats.value.packetsLost = report.packetsLost || 0
          stats.value.jitter = report.jitter || 0
        }
        if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
          stats.value.bitrate = Math.round(report.bytesSent * 8 / 1000)
          stats.value.framerate = report.framesPerSecond || 0
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          stats.value.roundTripTime = report.currentRoundTripTime ? Math.round(report.currentRoundTripTime * 1000) : 0
        }
        if (report.type === 'media-source' && report.kind === 'video') {
          stats.value.resolution = `${report.width}x${report.height}`
        }
      })
    }, 1000)
  }

  const stopStatsCollection = () => {
    if (statsInterval) {
      clearInterval(statsInterval)
      statsInterval = null
    }
  }

  // Development-safe cleanup that preserves connections during HMR
  onUnmounted(() => {
    // Only cleanup if not in development hot reload or if explicitly navigating away
    if (import.meta.env.PROD || !import.meta.hot) {
      stopSharing()
      stopViewing()
      stopStatsCollection()
    } else {
      // In development, only stop stats collection to prevent memory leaks
      stopStatsCollection()
    }
  })

  return {
    // Identity
    testId: readonly(testId),
    roomId,
    role: readonly(role),

    // Streams
    localStream: readonly(localStream),
    remoteStream: readonly(remoteStream),

    // Connection state
    isConnected: readonly(isConnected),
    connectionState: readonly(connectionState),
    iceConnectionState: readonly(iceConnectionState),

    // Stats & Debug
    stats: readonly(stats),
    debugLogs: readonly(debugLogs),

    // Actions
    startSharing,
    startViewing,
    stopSharing,
    stopViewing
  }
}
