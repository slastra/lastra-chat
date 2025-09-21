import { useUserMedia, useDisplayMedia } from '@vueuse/core'
import type { SignalingMessage } from '../../shared/types/webrtc'

interface MediaPeer {
  userId: string
  userName: string
  connection: RTCPeerConnection
  role: 'sender' | 'receiver'
  streamType: 'webcam' | 'desktop'
}

export const useMediaStream = () => {
  const { clientId, userName } = useUser()
  const { addUserStream, removeUserStream, updateUserMediaState } = useChatState()

  // Local media streams
  const localWebcamStream = ref<MediaStream | null>(null)
  const localDesktopStream = ref<MediaStream | null>(null)

  // WebRTC peers
  const peers = ref<Map<string, MediaPeer>>(new Map())

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

  // Generate TURN credentials
  const generateTurnCredentials = async (secret: string) => {
    const unixTimestamp = Math.floor(Date.now() / 1000) + 24 * 3600
    const username = `${unixTimestamp}:${clientId.value}`

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
      {
        urls: 'stun:turn.lastra.us:3478'
      },
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

  // Create peer connection
  const createPeerConnection = async (
    targetUserId: string,
    targetUserName: string,
    role: 'sender' | 'receiver',
    streamType: 'webcam' | 'desktop'
  ) => {
    console.log(`[MediaStream] Creating ${role} peer connection for ${streamType} with ${targetUserName}`)
    const iceServers = await getIceServers()
    const pc = new RTCPeerConnection({
      iceServers,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    })

    const peer: MediaPeer = {
      userId: targetUserId,
      userName: targetUserName,
      connection: pc,
      role,
      streamType
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`[MediaStream] Sending ICE candidate to ${targetUserName} for ${streamType}`)
        sendSignalingMessage({
          type: 'ice-candidate',
          targetUserId,
          streamType,
          candidate: event.candidate
        })
      }
    }

    // Handle incoming stream (for receivers)
    if (role === 'receiver') {
      pc.ontrack = (event) => {
        console.log(`[MediaStream] Received ${streamType} stream from ${targetUserName}`)
        if (event.streams && event.streams[0]) {
          addUserStream(targetUserId, event.streams[0], streamType)
          console.log(`[MediaStream] Added ${streamType} stream to UI for ${targetUserName}`)
        }
      }
    }

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`[MediaStream] Connection state for ${targetUserName} ${streamType}: ${pc.connectionState}`)
      if (pc.connectionState === 'connected') {
        console.log(`[MediaStream] Successfully connected to ${targetUserName} for ${streamType}`)
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        console.log(`[MediaStream] Connection failed/closed for ${targetUserName} ${streamType}`)
        removePeer(targetUserId, streamType)
      }
    }

    // Handle ICE connection state
    pc.oniceconnectionstatechange = () => {
      console.log(`[MediaStream] ICE state for ${targetUserName} ${streamType}: ${pc.iceConnectionState}`)
    }

    peers.value.set(`${targetUserId}-${streamType}`, peer)
    return pc
  }

  // Remove peer connection
  const removePeer = (userId: string, streamType: 'webcam' | 'desktop') => {
    const key = `${userId}-${streamType}`
    const peer = peers.value.get(key)
    if (peer) {
      peer.connection.close()
      peers.value.delete(key)
      removeUserStream(userId, streamType)
    }
  }

  // Send signaling message via SSE
  const sendSignalingMessage = async (message: Partial<SignalingMessage>) => {
    try {
      await $fetch('/api/chat-signal', {
        method: 'POST',
        body: {
          userId: clientId.value,
          userName: userName.value,
          ...message
        }
      })
    } catch (error) {
      console.error('[MediaStream] Failed to send signaling message:', error)
    }
  }

  // Toggle webcam
  const toggleWebcam = async () => {
    if (webcamEnabled.value) {
      // Stop webcam
      stopWebcam()
      webcamEnabled.value = false
      localWebcamStream.value = null

      // Close all webcam peer connections
      Array.from(peers.value.entries())
        .filter(([key]) => key.endsWith('-webcam'))
        .forEach(([key]) => {
          const userId = key.split('-')[0]
          if (userId) {
            removePeer(userId, 'webcam')
          }
        })

      // Update state
      if (clientId.value) {
        updateUserMediaState(clientId.value, { webcam: false })
      }
      await sendSignalingMessage({ type: 'media-state', mediaState: { webcam: false } })
    } else {
      // Start webcam
      console.log('[MediaStream] Starting webcam...')
      await startWebcam()
      if (webcamStream.value) {
        webcamEnabled.value = true
        localWebcamStream.value = webcamStream.value
        console.log('[MediaStream] Webcam started successfully')

        // Add to local streams
        if (clientId.value) {
          addUserStream(clientId.value, webcamStream.value, 'webcam')
          console.log('[MediaStream] Added local webcam stream to UI')

          // Update state
          updateUserMediaState(clientId.value, { webcam: true })
        }
        console.log('[MediaStream] Sending media-state signal for webcam ON')
        await sendSignalingMessage({ type: 'media-state', mediaState: { webcam: true } })

        // Initiate connections with all online users
        console.log('[MediaStream] Initiating connections after enabling webcam')
        await initiateWebcamConnections()
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

      // Close all desktop peer connections
      Array.from(peers.value.entries())
        .filter(([key]) => key.endsWith('-desktop'))
        .forEach(([key]) => {
          const userId = key.split('-')[0]
          if (userId) {
            removePeer(userId, 'desktop')
          }
        })

      // Update state
      if (clientId.value) {
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

          // Update state
          updateUserMediaState(clientId.value, { screen: true })
        }
        await sendSignalingMessage({ type: 'media-state', mediaState: { screen: true } })

        // Initiate connections with all online users
        await initiateDesktopConnections()
      }
    }
  }

  // Initiate webcam connections - broadcast our webcam to ALL users
  const initiateWebcamConnections = async () => {
    const { onlineUsers } = useChatState()
    console.log('[MediaStream] Broadcasting webcam to all users...')

    for (const user of onlineUsers.value) {
      // Skip ourselves, but connect to ALL other users to send our stream
      if (user.userId !== clientId.value) {
        const key = `${user.userId}-webcam`
        if (!peers.value.has(key)) {
          console.log(`[MediaStream] Initiating webcam broadcast to ${user.userName}`)
          await initiateConnection(user.userId, user.userName, 'webcam')
        } else {
          console.log(`[MediaStream] Already broadcasting webcam to ${user.userName}`)
        }
      }
    }
  }

  // Initiate desktop connections - broadcast our screen to ALL users
  const initiateDesktopConnections = async () => {
    const { onlineUsers } = useChatState()
    console.log('[MediaStream] Broadcasting screen to all users...')

    for (const user of onlineUsers.value) {
      // Skip ourselves, but connect to ALL other users to send our stream
      if (user.userId !== clientId.value) {
        const key = `${user.userId}-desktop`
        if (!peers.value.has(key)) {
          console.log(`[MediaStream] Initiating screen broadcast to ${user.userName}`)
          await initiateConnection(user.userId, user.userName, 'desktop')
        } else {
          console.log(`[MediaStream] Already broadcasting screen to ${user.userName}`)
        }
      }
    }
  }

  // Initiate connection with a specific user (only called when WE are broadcasting)
  const initiateConnection = async (
    targetUserId: string,
    targetUserName: string,
    streamType: 'webcam' | 'desktop'
  ) => {
    console.log(`[MediaStream] Starting broadcast connection to ${targetUserName} for ${streamType}`)

    // When initiating, we are always the sender (broadcaster)
    const pc = await createPeerConnection(targetUserId, targetUserName, 'sender', streamType)

    // Add our broadcasting stream
    const stream = streamType === 'webcam' ? localWebcamStream.value : localDesktopStream.value
    if (stream) {
      console.log(`[MediaStream] Adding local ${streamType} stream with ${stream.getTracks().length} tracks`)
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream)
        console.log(`[MediaStream] Added ${track.kind} track to connection`)
      })
    } else {
      console.error(`[MediaStream] Cannot broadcast - no local ${streamType} stream available!`)
      removePeer(targetUserId, streamType)
      return
    }

    // Create offer
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    console.log(`[MediaStream] Created offer for ${targetUserName} as broadcaster`)

    // Send offer
    await sendSignalingMessage({
      type: 'offer',
      targetUserId,
      streamType,
      offer: {
        type: offer.type,
        sdp: offer.sdp
      }
    })
    console.log(`[MediaStream] Sent broadcast offer to ${targetUserName}`)
  }

  // Handle incoming signaling messages
  const handleSignalingMessage = async (message: SignalingMessage) => {
    switch (message.type) {
      case 'offer':
        await handleOffer(message)
        break

      case 'answer':
        await handleAnswer(message)
        break

      case 'ice-candidate':
        await handleIceCandidate(message)
        break

      case 'media-state':
        await handleMediaState(message)
        break
    }
  }

  // Handle incoming offer
  const handleOffer = async (message: SignalingMessage) => {
    if (!message.offer || !message.streamType) return

    console.log(`[MediaStream] Received offer from ${message.userName} for ${message.streamType}`)

    // Determine our role based on whether we're broadcasting
    const areWeBroadcasting = message.streamType === 'webcam' ? webcamEnabled.value : screenEnabled.value
    const role = areWeBroadcasting ? 'sender' : 'receiver'

    console.log(`[MediaStream] Answering as ${role} for ${message.streamType} (broadcasting: ${areWeBroadcasting})`)

    const pc = await createPeerConnection(
      message.userId,
      message.userName || 'Unknown',
      role,
      message.streamType
    )

    // If we're broadcasting, add our tracks before creating the answer
    if (areWeBroadcasting) {
      const stream = message.streamType === 'webcam' ? localWebcamStream.value : localDesktopStream.value
      if (stream) {
        console.log(`[MediaStream] Adding our ${message.streamType} tracks to answer`)
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream)
        })
      } else {
        console.warn(`[MediaStream] We're broadcasting but no local ${message.streamType} stream found`)
      }
    } else {
      console.log(`[MediaStream] Not broadcasting ${message.streamType}, answering as viewer only`)
    }

    await pc.setRemoteDescription(new RTCSessionDescription(message.offer))
    console.log(`[MediaStream] Set remote description for offer from ${message.userName}`)

    // Create answer
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    console.log(`[MediaStream] Created answer for ${message.userName}`)

    // Send answer
    await sendSignalingMessage({
      type: 'answer',
      targetUserId: message.userId,
      streamType: message.streamType,
      answer: {
        type: answer.type,
        sdp: answer.sdp
      }
    })
    console.log(`[MediaStream] Sent answer to ${message.userName}`)
  }

  // Handle incoming answer
  const handleAnswer = async (message: SignalingMessage) => {
    if (!message.answer || !message.streamType) return

    console.log(`[MediaStream] Received answer from ${message.userName} for ${message.streamType}`)
    const key = `${message.userId}-${message.streamType}`
    const peer = peers.value.get(key)

    if (peer) {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(message.answer))
      console.log(`[MediaStream] Set remote description for answer from ${message.userName}`)
    } else {
      console.warn(`[MediaStream] No peer found for answer from ${message.userName}`)
    }
  }

  // Handle incoming ICE candidate
  const handleIceCandidate = async (message: SignalingMessage) => {
    if (!message.candidate || !message.streamType) return

    const key = `${message.userId}-${message.streamType}`
    const peer = peers.value.get(key)

    if (peer) {
      await peer.connection.addIceCandidate(new RTCIceCandidate(message.candidate))
      console.log(`[MediaStream] Added ICE candidate from ${message.userName} for ${message.streamType}`)
    } else {
      console.warn(`[MediaStream] No peer found for ICE candidate from ${message.userName}`)
    }
  }

  // Handle media state updates
  const handleMediaState = async (message: SignalingMessage) => {
    if (message.mediaState) {
      console.log(`[MediaStream] Received media state from ${message.userId}:`, message.mediaState)
      updateUserMediaState(message.userId, message.mediaState)

      // Don't process our own media state updates
      if (message.userId === clientId.value) {
        return
      }

      // IMPORTANT: We don't initiate connections when someone else turns on their media
      // They will connect to us if we have media on
      // This prevents race conditions where both users try to be the caller

      // If user turned off media, remove their streams and connections
      if (message.mediaState.webcam === false) {
        console.log(`[MediaStream] User ${message.userId} turned off webcam, cleaning up`)
        removeUserStream(message.userId, 'webcam')
        removePeer(message.userId, 'webcam')
      }
      if (message.mediaState.screen === false) {
        console.log(`[MediaStream] User ${message.userId} turned off screen, cleaning up`)
        removeUserStream(message.userId, 'desktop')
        removePeer(message.userId, 'desktop')
      }
    }
  }

  // Check for users with media and connect if we're broadcasting to them
  const checkAndConnectToExistingMedia = async () => {
    const { onlineUsers } = useChatState()
    console.log('[MediaStream] Checking for existing media streams from users')
    console.log('[MediaStream] Online users:', onlineUsers.value.map(u => ({
      name: u.userName,
      id: u.userId,
      mediaState: u.mediaState
    })))
    console.log('[MediaStream] My media state: webcam=' + webcamEnabled.value + ', screen=' + screenEnabled.value)
    console.log('[MediaStream] My clientId:', clientId.value)

    // IMPORTANT: Only initiate connections if WE are broadcasting
    // If we're just viewing, the broadcaster will connect to us

    for (const user of onlineUsers.value) {
      console.log(`[MediaStream] Checking user ${user.userName} (${user.userId})`)

      if (user.userId === clientId.value) {
        console.log(`[MediaStream] Skipping self`)
        continue
      }

      // If WE have webcam enabled, connect to all users (to send our stream)
      if (webcamEnabled.value) {
        const key = `${user.userId}-webcam`
        if (!peers.value.has(key)) {
          console.log(`[MediaStream] We are broadcasting webcam to ${user.userName}`)
          await initiateConnection(user.userId, user.userName, 'webcam')
        } else {
          console.log(`[MediaStream] Already broadcasting webcam to ${user.userName}`)
        }
      } else if (user.mediaState?.webcam) {
        // If they have webcam and we don't, just log it
        // They will initiate the connection to us
        console.log(`[MediaStream] User ${user.userName} is broadcasting webcam, waiting for their connection`)
      }

      // If WE have screen enabled, connect to all users (to send our stream)
      if (screenEnabled.value) {
        const key = `${user.userId}-desktop`
        if (!peers.value.has(key)) {
          console.log(`[MediaStream] We are broadcasting screen to ${user.userName}`)
          await initiateConnection(user.userId, user.userName, 'desktop')
        } else {
          console.log(`[MediaStream] Already broadcasting screen to ${user.userName}`)
        }
      } else if (user.mediaState?.screen) {
        // If they have screen and we don't, just log it
        // They will initiate the connection to us
        console.log(`[MediaStream] User ${user.userName} is broadcasting screen, waiting for their connection`)
      }
    }
  }

  // Clean up on unmount
  onUnmounted(() => {
    // Stop all local streams
    if (webcamEnabled.value) toggleWebcam()
    if (screenEnabled.value) toggleScreen()

    // Close all peer connections
    peers.value.forEach((peer) => {
      peer.connection.close()
    })
    peers.value.clear()
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
    checkAndConnectToExistingMedia
  }
}
