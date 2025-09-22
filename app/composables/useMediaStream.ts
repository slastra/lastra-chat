import { useUserMedia, useDisplayMedia } from '@vueuse/core'
import type { SignalingMessage } from '../../shared/types/webrtc'
import type { StreamType } from './usePeerManager'

export const useMediaStream = (ws?: ReturnType<typeof useWebSocketChat>) => {
  const { clientId, userName } = useUser()
  const { addUserStream, removeUserStream, updateUserMediaState } = useChatState()

  // Local media streams
  const localWebcamStream = ref<MediaStream | null>(null)
  const localDesktopStream = ref<MediaStream | null>(null)

  // Media states - use persistent state to survive refreshes
  const webcamEnabled = useState('mediaStreamWebcamEnabled', () => false)
  const micEnabled = useState('mediaStreamMicEnabled', () => false)
  const screenEnabled = useState('mediaStreamScreenEnabled', () => false)

  // VueUse media composables
  const {
    stream: webcamStream,
    enabled: _webcamActive,
    start: startWebcam,
    stop: stopWebcam
  } = useUserMedia({
    constraints: {
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: true
    }
  })

  const {
    stream: desktopStream,
    enabled: _desktopActive,
    start: startDesktop,
    stop: stopDesktop
  } = useDisplayMedia({
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 }
    },
    audio: false
  })

  // Send signaling message via WebSocket
  const sendSignalingMessage = async (message: Partial<SignalingMessage>) => {
    const websocket = ws || useWebSocketChat()

    if (!websocket.isConnected.value) {
      console.error('[MediaStream] Cannot send signal: WebSocket not connected')
      return
    }

    try {
      websocket.send('webrtc-signal', {
        userId: clientId.value,
        userName: userName.value,
        ...message
      })
    } catch (error) {
      console.error('[MediaStream] Failed to send signaling message:', error)
    }
  }

  // Initialize PeerManager with callbacks
  const peerManager = usePeerManager({
    onStreamReceived: (userId, stream, streamType) => {
      addUserStream(userId, stream, streamType)
    },
    onStreamRemoved: (userId, streamType) => {
      removeUserStream(userId, streamType)
    },
    sendSignal: sendSignalingMessage
  })

  // Toggle webcam
  const toggleWebcam = async () => {
    if (webcamEnabled.value) {
      // Stop webcam
      stopWebcam()
      webcamEnabled.value = false
      localWebcamStream.value = null

      // Close only sender webcam connections (where we're sending our stream)
      const senderConnections = peerManager.getActiveConnectionsByRole('sender', 'webcam')
      for (const conn of senderConnections) {
        await peerManager.closeConnection(conn.remoteUserId, 'webcam')
      }

      // Update state
      if (clientId.value) {
        removeUserStream(clientId.value, 'webcam')
        updateUserMediaState(clientId.value, { webcam: false })
      }
      await sendSignalingMessage({ type: 'media-state', mediaState: { webcam: false } })
    } else {
      // Start webcam
      await startWebcam()
      if (webcamStream.value) {
        webcamEnabled.value = true
        localWebcamStream.value = webcamStream.value

        // Add to local streams
        if (clientId.value) {
          addUserStream(clientId.value, webcamStream.value, 'webcam')
          updateUserMediaState(clientId.value, { webcam: true })
        }

        await sendSignalingMessage({ type: 'media-state', mediaState: { webcam: true } })

        // Broadcast to all online users
        await broadcastToAllUsers('webcam')
      } else {
        console.error('[MediaStream] Failed to start webcam - no stream')
      }
    }
  }

  // Toggle microphone
  const toggleMic = () => {
    if (localWebcamStream.value) {
      const audioTracks = localWebcamStream.value.getAudioTracks()
      micEnabled.value = !micEnabled.value
      audioTracks.forEach((track) => {
        track.enabled = micEnabled.value
      })
      if (clientId.value) {
        updateUserMediaState(clientId.value, { microphone: micEnabled.value })
      }
      sendSignalingMessage({ type: 'media-state', mediaState: { microphone: micEnabled.value } })
    }
  }

  // Toggle screen share
  const toggleScreen = async () => {
    if (screenEnabled.value) {
      // Stop screen share
      stopDesktop()
      screenEnabled.value = false
      localDesktopStream.value = null

      // Close only sender desktop connections (where we're sharing our screen)
      const senderConnections = peerManager.getActiveConnectionsByRole('sender', 'desktop')
      for (const conn of senderConnections) {
        await peerManager.closeConnection(conn.remoteUserId, 'desktop')
      }

      // Update state
      if (clientId.value) {
        removeUserStream(clientId.value, 'desktop')
        updateUserMediaState(clientId.value, { screen: false })
      }
      await sendSignalingMessage({ type: 'media-state', mediaState: { screen: false } })
    } else {
      // Start screen share
      await startDesktop()
      if (desktopStream.value) {
        screenEnabled.value = true
        localDesktopStream.value = desktopStream.value

        // Add to local streams
        if (clientId.value) {
          addUserStream(clientId.value, desktopStream.value, 'desktop')
          updateUserMediaState(clientId.value, { screen: true })
        }
        await sendSignalingMessage({ type: 'media-state', mediaState: { screen: true } })

        // Broadcast to all online users
        await broadcastToAllUsers('desktop')
      }
    }
  }

  // Broadcast stream to all online users
  const broadcastToAllUsers = async (streamType: StreamType) => {
    const { onlineUsers } = useChatState()
    const stream = streamType === 'webcam' ? localWebcamStream.value : localDesktopStream.value

    if (!stream) {
      console.error(`[MediaStream] Cannot broadcast ${streamType}: no local stream`)
      return
    }

    console.log(`[MediaStream] Broadcasting ${streamType} to ${onlineUsers.value.length - 1} users`)

    for (const user of onlineUsers.value) {
      if (user.userId !== clientId.value) {
        console.log(`[MediaStream] Creating offer to send ${streamType} to ${user.userId}`)
        await peerManager.createOffer(user.userId, user.userName, streamType, stream)
      }
    }
  }

  // Handle incoming signaling messages
  const handleSignalingMessage = async (message: SignalingMessage) => {
    console.log(`[MediaStream] Received signaling message: type=${message.type}, from=${message.userId}, streamType=${message.streamType}`)

    switch (message.type) {
      case 'offer': {
        console.log(`[MediaStream] Processing offer from ${message.userId} for ${message.streamType}`)
        // Determine if we should send our stream back
        const streamType = message.streamType as StreamType
        const localStream = streamType === 'webcam' ? localWebcamStream.value : localDesktopStream.value
        await peerManager.handleOffer(message, localStream || undefined)
        break
      }

      case 'answer':
        console.log(`[MediaStream] Processing answer from ${message.userId} for ${message.streamType}`)
        await peerManager.handleAnswer(message)
        break

      case 'ice-candidate':
        await peerManager.handleIceCandidate(message)
        break

      case 'media-state':
        await handleMediaState(message)
        break

      case 'request-stream':
        await handleStreamRequest(message)
        break
    }
  }

  // Handle media state updates
  const handleMediaState = async (message: SignalingMessage) => {
    console.log(`[MediaStream] handleMediaState from ${message.userId}:`, message.mediaState)

    if (message.mediaState) {
      updateUserMediaState(message.userId, message.mediaState)

      // Don't process our own media state updates
      if (message.userId === clientId.value) {
        console.log('[MediaStream] Ignoring our own media state update')
        return
      }

      // If user turned off media, clean up connections
      if (message.mediaState.webcam === false) {
        console.log(`[MediaStream] User ${message.userId} turned off webcam, closing connection`)
        await peerManager.closeConnection(message.userId, 'webcam')
      }
      if (message.mediaState.screen === false) {
        console.log(`[MediaStream] User ${message.userId} turned off screen, closing connection`)
        await peerManager.closeConnection(message.userId, 'desktop')
      }

      // If user turned on media, request their stream (check THEIR connection to us)
      if (message.mediaState.webcam) {
        const incomingState = peerManager.getReverseConnectionState(message.userId, 'webcam')
        console.log(`[MediaStream] User ${message.userId} has webcam on, reverse connection state: ${incomingState}`)
        if (incomingState === 'idle' || incomingState === 'failed' || incomingState === 'closed') {
          console.log(`[MediaStream] Requesting webcam stream from ${message.userId}`)
          await peerManager.requestStream(message.userId, 'webcam')
        } else {
          console.log(`[MediaStream] Not requesting webcam from ${message.userId}, already in state: ${incomingState}`)
        }
      }
      if (message.mediaState.screen) {
        const incomingState = peerManager.getReverseConnectionState(message.userId, 'desktop')
        console.log(`[MediaStream] User ${message.userId} has screen on, reverse connection state: ${incomingState}`)
        if (incomingState === 'idle' || incomingState === 'failed' || incomingState === 'closed') {
          console.log(`[MediaStream] Requesting screen stream from ${message.userId}`)
          await peerManager.requestStream(message.userId, 'desktop')
        } else {
          console.log(`[MediaStream] Not requesting screen from ${message.userId}, already in state: ${incomingState}`)
        }
      }
    }
  }

  // Handle stream request from a viewer
  const handleStreamRequest = async (message: SignalingMessage) => {
    if (!message.streamType) return

    const streamType = message.streamType as StreamType
    const areWeBroadcasting = streamType === 'webcam' ? webcamEnabled.value : screenEnabled.value

    console.log(`[MediaStream] Stream request from ${message.userId} for ${streamType}, we are broadcasting: ${areWeBroadcasting}`)

    if (areWeBroadcasting) {
      const stream = streamType === 'webcam' ? localWebcamStream.value : localDesktopStream.value
      if (stream) {
        console.log(`[MediaStream] Creating offer for ${message.userId} with our ${streamType} stream`)
        await peerManager.createOffer(message.userId, message.userName || 'Unknown', streamType, stream)
      } else {
        console.log(`[MediaStream] Cannot send ${streamType} to ${message.userId}: no local stream`)
      }
    } else {
      console.log(`[MediaStream] Not sending ${streamType} to ${message.userId}: not broadcasting`)
    }
  }

  // Check for existing media streams and connect
  const checkAndConnectToExistingMedia = async () => {
    const { onlineUsers } = useChatState()

    console.log(`[MediaStream] checkAndConnectToExistingMedia called, ${onlineUsers.value.length} online users`)
    console.log(`[MediaStream] Our state: webcam=${webcamEnabled.value}, screen=${screenEnabled.value}`)

    for (const user of onlineUsers.value) {
      if (user.userId === clientId.value) continue

      console.log(`[MediaStream] Checking user ${user.userId}: webcam=${user.mediaState?.webcam}, screen=${user.mediaState?.screen}`)

      // Handle webcam connections
      // If we're broadcasting, create our outgoing connection
      if (webcamEnabled.value && localWebcamStream.value) {
        const outgoingState = peerManager.getConnectionState(user.userId, 'webcam')
        console.log(`[MediaStream] Our webcam -> ${user.userId}: state=${outgoingState}`)
        if (outgoingState === 'idle') {
          console.log(`[MediaStream] Creating offer to send our webcam to ${user.userId}`)
          await peerManager.createOffer(user.userId, user.userName, 'webcam', localWebcamStream.value)
        }
      }

      // If they're broadcasting, request their stream (check THEIR connection to us)
      if (user.mediaState?.webcam) {
        const incomingState = peerManager.getReverseConnectionState(user.userId, 'webcam')
        console.log(`[MediaStream] ${user.userId} webcam -> us: reverse state=${incomingState}`)
        if (incomingState === 'idle') {
          console.log(`[MediaStream] Requesting webcam stream from ${user.userId}`)
          await peerManager.requestStream(user.userId, 'webcam')
        } else {
          console.log(`[MediaStream] Not requesting webcam from ${user.userId}, already ${incomingState}`)
        }
      }

      // Handle screen share connections
      // If we're sharing screen, create our outgoing connection
      if (screenEnabled.value && localDesktopStream.value) {
        const outgoingState = peerManager.getConnectionState(user.userId, 'desktop')
        console.log(`[MediaStream] Our screen -> ${user.userId}: state=${outgoingState}`)
        if (outgoingState === 'idle') {
          console.log(`[MediaStream] Creating offer to send our screen to ${user.userId}`)
          await peerManager.createOffer(user.userId, user.userName, 'desktop', localDesktopStream.value)
        }
      }

      // If they're sharing screen, request their stream (check THEIR connection to us)
      if (user.mediaState?.screen) {
        const incomingState = peerManager.getReverseConnectionState(user.userId, 'desktop')
        console.log(`[MediaStream] ${user.userId} screen -> us: reverse state=${incomingState}`)
        if (incomingState === 'idle') {
          console.log(`[MediaStream] Requesting screen stream from ${user.userId}`)
          await peerManager.requestStream(user.userId, 'desktop')
        } else {
          console.log(`[MediaStream] Not requesting screen from ${user.userId}, already ${incomingState}`)
        }
      }
    }

    console.log('[MediaStream] checkAndConnectToExistingMedia completed')
  }

  // Reconnection logic for after refresh
  const attemptStreamReconnection = async () => {
    if (import.meta.client) {
      // Wait a bit for UI to initialize
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Attempt to restore webcam if it was enabled
      if (webcamEnabled.value && !localWebcamStream.value) {
        console.log('[MediaStream] Attempting to restore webcam after refresh')
        try {
          await toggleWebcam()
        } catch (error) {
          console.error('[MediaStream] Failed to restore webcam:', error)
          webcamEnabled.value = false
        }
      }

      // Attempt to restore screen share if it was enabled
      if (screenEnabled.value && !localDesktopStream.value) {
        console.log('[MediaStream] Attempting to restore screen share after refresh')
        try {
          await toggleScreen()
        } catch (error) {
          console.error('[MediaStream] Failed to restore screen share:', error)
          screenEnabled.value = false
        }
      }
    }
  }

  // Initialize reconnection on mount
  onMounted(() => {
    attemptStreamReconnection()
  })

  // Clean up on unmount
  onUnmounted(() => {
    // Development-safe cleanup
    if (import.meta.env.PROD || !import.meta.hot) {
      // Stop all local streams
      if (webcamEnabled.value) toggleWebcam()
      if (screenEnabled.value) toggleScreen()

      // PeerManager will handle its own cleanup
    }
  })

  return {
    webcamEnabled,
    micEnabled,
    screenEnabled,
    localWebcamStream,
    localDesktopStream,
    toggleWebcam,
    toggleMic,
    toggleScreen,
    handleSignalingMessage,
    checkAndConnectToExistingMedia,
    // Expose for debugging
    peerManager
  }
}
