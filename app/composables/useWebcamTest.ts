import { useUserMedia, useDevicesList } from '@vueuse/core'
import type { TestSignalMessage } from '../../shared/types/webrtc'

export const useWebcamTest = () => {
  const testId = ref(Math.random().toString(36).substring(7))
  const roomId = ref('')
  const role = ref<'idle' | 'broadcaster' | 'viewer'>('idle')
  const isConnected = ref(false)
  const connectionState = ref<RTCPeerConnectionState>('new')

  // Get available devices
  const {
    devices: _devices,
    videoInputs: cameras,
    audioInputs: microphones,
    audioOutputs: speakers,
    permissionGranted,
    ensurePermissions
  } = useDevicesList({
    requestPermissions: true
  })

  // Selected devices - Initialize with defaults
  const selectedCamera = ref<string>('')
  const selectedMicrophone = ref<string>('')
  const enableVideo = ref(true) // Default to enabled
  const enableAudio = ref(true) // Default to enabled

  // Media stream setup
  const constraints = computed(() => ({
    video: enableVideo.value
      ? {
          deviceId: selectedCamera.value || undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      : false,
    audio: enableAudio.value
      ? {
          deviceId: selectedMicrophone.value || undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      : false
  }))

  const { stream: localStream, start: startCamera, stop: stopCamera, restart } = useUserMedia({ constraints })

  // WebRTC state
  const remoteStream = ref<MediaStream | null>(null)
  const peerConnection = ref<RTCPeerConnection | null>(null)
  const pollingInterval = ref<NodeJS.Timeout | null>(null)

  // Stats
  const stats = ref({
    videoBitrate: 0,
    audioBitrate: 0,
    framerate: 0,
    resolution: '',
    audioLevel: 0,
    videoPacketsLost: 0,
    audioPacketsLost: 0,
    roundTripTime: 0
  })

  // Debug logs
  const debugLogs = ref<Array<{ time: string, message: string, type: 'info' | 'error' | 'success' }>>([])

  const addDebugLog = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    const time = new Date().toLocaleTimeString()
    debugLogs.value.unshift({ time, message, type })
    if (debugLogs.value.length > 100) {
      debugLogs.value.pop()
    }
    console.log(`[WebcamTest] ${message}`)
  }

  // Set default devices when available
  watchEffect(() => {
    if (cameras.value.length > 0 && !selectedCamera.value && cameras.value[0]) {
      selectedCamera.value = cameras.value[0].deviceId
    }
    if (microphones.value.length > 0 && !selectedMicrophone.value && microphones.value[0]) {
      selectedMicrophone.value = microphones.value[0].deviceId
    }
  })

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
      await $fetch('/api/webcam-test/signal', {
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
      const messages = await $fetch(`/api/webcam-test/messages`, {
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
    if (message.senderId === testId.value) return

    switch (message.type) {
      case 'offer':
        if (role.value === 'viewer' && message.data?.offer) {
          await handleOffer(message.data.offer)
        }
        break
      case 'answer':
        if (role.value === 'broadcaster' && message.data?.answer) {
          await handleAnswer(message.data.answer)
        }
        break
      case 'ice-candidate':
        if (message.data?.candidate) {
          await handleIceCandidate(message.data.candidate)
        }
        break
      case 'broadcast-start':
        addDebugLog(`${message.senderName} started broadcasting`, 'info')
        break
      case 'broadcast-stop':
        addDebugLog(`${message.senderName} stopped broadcasting`, 'info')
        if (role.value === 'viewer') {
          stopViewing()
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

    peerConnection.value.onicecandidate = (event) => {
      if (event.candidate) {
        addDebugLog(`ICE candidate: ${event.candidate.type}`, 'info')
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

        if (connectionState.value === 'connected') {
          isConnected.value = true
          startStatsCollection()
        } else if (connectionState.value === 'failed' || connectionState.value === 'closed') {
          isConnected.value = false
          stopStatsCollection()
        }
      }
    }

    peerConnection.value.ontrack = (event) => {
      addDebugLog('Received remote stream', 'success')
      remoteStream.value = event.streams[0] || null
    }
  }

  // Start broadcasting
  const startBroadcast = async () => {
    if (!roomId.value) {
      addDebugLog('Please enter a room ID', 'error')
      return
    }

    // Validate that at least one media type is enabled
    if (!enableVideo.value && !enableAudio.value) {
      addDebugLog('At least one of video or audio must be enabled', 'error')
      return
    }

    try {
      await ensurePermissions()
      await startCamera()

      if (!localStream.value) {
        throw new Error('Failed to access camera/microphone')
      }

      role.value = 'broadcaster'
      await joinRoom()
      await createPeerConnection()

      // Add tracks to peer connection
      localStream.value.getTracks().forEach((track) => {
        peerConnection.value!.addTrack(track, localStream.value!)
        addDebugLog(`Added ${track.kind} track to connection`, 'info')
      })

      // Create offer
      const offer = await peerConnection.value!.createOffer()
      await peerConnection.value!.setLocalDescription(offer)

      await sendMessage({
        type: 'offer',
        roomId: roomId.value,
        senderId: testId.value,
        senderName: `User ${testId.value}`,
        data: { offer }
      })

      await sendMessage({
        type: 'broadcast-start',
        roomId: roomId.value,
        senderId: testId.value,
        senderName: `User ${testId.value}`
      })

      addDebugLog('Started broadcasting, waiting for viewers...', 'success')
    } catch (error) {
      addDebugLog(`Failed to start broadcast: ${error}`, 'error')
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
      addDebugLog('Joined room as viewer, waiting for broadcast...', 'info')
    } catch (error) {
      addDebugLog(`Failed to start viewing: ${error}`, 'error')
      role.value = 'idle'
    }
  }

  // Handle offer
  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    addDebugLog('Received offer from broadcaster', 'info')

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

    addDebugLog('Sent answer to broadcaster', 'success')
  }

  // Handle answer
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

  // Join room
  const joinRoom = async () => {
    await $fetch('/api/webcam-test/join', {
      method: 'POST',
      body: {
        roomId: roomId.value,
        clientId: testId.value,
        role: role.value
      }
    })

    if (!pollingInterval.value) {
      pollingInterval.value = setInterval(pollMessages, 1000)
    }

    addDebugLog(`Joined room: ${roomId.value}`, 'success')
  }

  // Stop broadcasting
  const stopBroadcast = async () => {
    stopCamera()

    if (peerConnection.value) {
      peerConnection.value.close()
      peerConnection.value = null
    }

    await sendMessage({
      type: 'broadcast-stop',
      roomId: roomId.value,
      senderId: testId.value,
      senderName: `User ${testId.value}`
    })

    await leaveRoom()

    role.value = 'idle'
    isConnected.value = false

    addDebugLog('Stopped broadcasting', 'info')
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
    if (pollingInterval.value) {
      clearInterval(pollingInterval.value)
      pollingInterval.value = null
    }

    try {
      await $fetch('/api/webcam-test/leave', {
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

  // Toggle video/audio during call
  const toggleVideo = () => {
    if (localStream.value) {
      const videoTrack = localStream.value.getVideoTracks()[0]
      if (videoTrack) {
        // Don't disable if it's the only active track
        if (enableAudio.value || !videoTrack.enabled) {
          videoTrack.enabled = !videoTrack.enabled
          enableVideo.value = videoTrack.enabled
          addDebugLog(`Video ${videoTrack.enabled ? 'enabled' : 'disabled'}`, 'info')
        } else {
          addDebugLog('Cannot disable video when audio is already disabled', 'error')
        }
      }
    }
  }

  const toggleAudio = () => {
    if (localStream.value) {
      const audioTrack = localStream.value.getAudioTracks()[0]
      if (audioTrack) {
        // Don't disable if it's the only active track
        if (enableVideo.value || !audioTrack.enabled) {
          audioTrack.enabled = !audioTrack.enabled
          enableAudio.value = audioTrack.enabled
          addDebugLog(`Audio ${audioTrack.enabled ? 'enabled' : 'disabled'}`, 'info')
        } else {
          addDebugLog('Cannot disable audio when video is already disabled', 'error')
        }
      }
    }
  }

  // Switch camera
  const switchCamera = async (deviceId: string) => {
    selectedCamera.value = deviceId
    if (role.value === 'broadcaster') {
      await restart()
    }
  }

  // Switch microphone
  const switchMicrophone = async (deviceId: string) => {
    selectedMicrophone.value = deviceId
    if (role.value === 'broadcaster') {
      await restart()
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
        if (report.type === 'inbound-rtp') {
          if (report.mediaType === 'video') {
            stats.value.videoBitrate = Math.round(report.bytesReceived * 8 / 1000)
            stats.value.framerate = report.framesPerSecond || 0
            stats.value.videoPacketsLost = report.packetsLost || 0
          } else if (report.mediaType === 'audio') {
            stats.value.audioBitrate = Math.round(report.bytesReceived * 8 / 1000)
            stats.value.audioPacketsLost = report.packetsLost || 0
          }
        }
        if (report.type === 'outbound-rtp') {
          if (report.mediaType === 'video') {
            stats.value.videoBitrate = Math.round(report.bytesSent * 8 / 1000)
            stats.value.framerate = report.framesPerSecond || 0
          } else if (report.mediaType === 'audio') {
            stats.value.audioBitrate = Math.round(report.bytesSent * 8 / 1000)
          }
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

  // Cleanup
  onUnmounted(() => {
    stopBroadcast()
    stopViewing()
    stopStatsCollection()
  })

  return {
    // Identity
    testId: readonly(testId),
    roomId,
    role: readonly(role),

    // Streams
    localStream: readonly(localStream),
    remoteStream: readonly(remoteStream),

    // Connection
    isConnected: readonly(isConnected),
    connectionState: readonly(connectionState),

    // Devices
    cameras: readonly(cameras),
    microphones: readonly(microphones),
    speakers: readonly(speakers),
    selectedCamera,
    selectedMicrophone,
    enableVideo,
    enableAudio,
    permissionGranted,

    // Stats & Debug
    stats: readonly(stats),
    debugLogs: readonly(debugLogs),

    // Actions
    startBroadcast,
    startViewing,
    stopBroadcast,
    stopViewing,
    toggleVideo,
    toggleAudio,
    switchCamera,
    switchMicrophone,
    ensurePermissions
  }
}
