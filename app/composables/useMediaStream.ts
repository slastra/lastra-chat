import { useUserMedia, useDisplayMedia } from '@vueuse/core'
import type { SignalingMessage } from '../../shared/types/webrtc'
import type { StreamType } from './usePeerManager'

export const useMediaStream = (ws?: ReturnType<typeof useWebSocketChat>) => {
  const { clientId, userName } = useUser()
  const { addUserStream, removeUserStream, updateUserMediaState } = useChatState()

  // Local media streams
  const localWebcamStream = ref<MediaStream | null>(null)
  const localDesktopStream = ref<MediaStream | null>(null)

  // Media states
  const webcamEnabled = ref(false)
  const micEnabled = ref(false)
  const screenEnabled = ref(false)

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

      // Close all webcam connections
      const connections = peerManager.getActiveConnections()
      for (const conn of connections) {
        if (conn.streamType === 'webcam') {
          await peerManager.closeConnection(conn.remoteUserId, 'webcam')
        }
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

      // Close all desktop connections
      const connections = peerManager.getActiveConnections()
      for (const conn of connections) {
        if (conn.streamType === 'desktop') {
          await peerManager.closeConnection(conn.remoteUserId, 'desktop')
        }
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

    for (const user of onlineUsers.value) {
      if (user.userId !== clientId.value) {
        await peerManager.createOffer(user.userId, user.userName, streamType, stream)
      }
    }
  }

  // Handle incoming signaling messages
  const handleSignalingMessage = async (message: SignalingMessage) => {
    switch (message.type) {
      case 'offer': {
        // Determine if we should send our stream back
        const streamType = message.streamType as StreamType
        const localStream = streamType === 'webcam' ? localWebcamStream.value : localDesktopStream.value
        await peerManager.handleOffer(message, localStream || undefined)
        break
      }

      case 'answer':
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
    if (message.mediaState) {
      updateUserMediaState(message.userId, message.mediaState)

      // Don't process our own media state updates
      if (message.userId === clientId.value) {
        return
      }

      // If user turned off media, clean up connections
      if (message.mediaState.webcam === false) {
        await peerManager.closeConnection(message.userId, 'webcam')
      }
      if (message.mediaState.screen === false) {
        await peerManager.closeConnection(message.userId, 'desktop')
      }

      // If user turned on media and we're not broadcasting, request their stream
      if (message.mediaState.webcam && !webcamEnabled.value) {
        const state = peerManager.getConnectionState(message.userId, 'webcam')
        if (state === 'idle' || state === 'failed' || state === 'closed') {
          await peerManager.requestStream(message.userId, 'webcam')
        }
      }
      if (message.mediaState.screen && !screenEnabled.value) {
        const state = peerManager.getConnectionState(message.userId, 'desktop')
        if (state === 'idle' || state === 'failed' || state === 'closed') {
          await peerManager.requestStream(message.userId, 'desktop')
        }
      }
    }
  }

  // Handle stream request from a viewer
  const handleStreamRequest = async (message: SignalingMessage) => {
    if (!message.streamType) return

    const streamType = message.streamType as StreamType
    const areWeBroadcasting = streamType === 'webcam' ? webcamEnabled.value : screenEnabled.value

    if (areWeBroadcasting) {
      const stream = streamType === 'webcam' ? localWebcamStream.value : localDesktopStream.value
      if (stream) {
        await peerManager.createOffer(message.userId, message.userName || 'Unknown', streamType, stream)
      }
    }
  }

  // Check for existing media streams and connect
  const checkAndConnectToExistingMedia = async () => {
    const { onlineUsers } = useChatState()

    for (const user of onlineUsers.value) {
      if (user.userId === clientId.value) continue

      // If we're broadcasting, send our stream to them
      if (webcamEnabled.value && localWebcamStream.value) {
        await peerManager.createOffer(user.userId, user.userName, 'webcam', localWebcamStream.value)
      } else if (user.mediaState?.webcam) {
        // If they have webcam and we don't, request their stream
        const state = peerManager.getConnectionState(user.userId, 'webcam')
        if (state === 'idle') {
          await peerManager.requestStream(user.userId, 'webcam')
        }
      }

      // Same for screen share
      if (screenEnabled.value && localDesktopStream.value) {
        await peerManager.createOffer(user.userId, user.userName, 'desktop', localDesktopStream.value)
      } else if (user.mediaState?.screen) {
        const state = peerManager.getConnectionState(user.userId, 'desktop')
        if (state === 'idle') {
          await peerManager.requestStream(user.userId, 'desktop')
        }
      }
    }
  }

  // Clean up on unmount
  onUnmounted(() => {
    // Stop all local streams
    if (webcamEnabled.value) toggleWebcam()
    if (screenEnabled.value) toggleScreen()

    // PeerManager will handle its own cleanup
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
