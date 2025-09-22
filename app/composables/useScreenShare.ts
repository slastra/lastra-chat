import { useDisplayMedia } from '@vueuse/core'
import type { ScreenShareMessage, SignalingMessage } from '../../shared/types/webrtc'

interface ScreenSharePeer {
  userId: string
  userName: string
  connection: RTCPeerConnection
  role: 'sharer' | 'viewer'
}

export const useScreenShare = () => {
  const { clientId, userName } = useUser()
  const { stream, enabled, start: startCapture, stop: stopCapture } = useDisplayMedia({
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 }
    },
    audio: false // Can be enabled for system audio
  })

  const peers = ref<Map<string, ScreenSharePeer>>(new Map())
  const localStream = ref<MediaStream | null>(null)
  const remoteStream = ref<MediaStream | null>(null)
  const shareStatus = ref<'idle' | 'sharing' | 'viewing'>('idle')
  const viewerCount = ref(0)
  const connectionStats = ref({
    bitrate: 0,
    framerate: 0,
    resolution: '',
    latency: 0
  })

  // Generate TURN credentials (same as in useTurnTest)
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

  // Create peer connection for a viewer
  const createPeerConnection = async (targetUserId: string, targetUserName: string, role: 'sharer' | 'viewer') => {
    const iceServers = await getIceServers()
    const pc = new RTCPeerConnection({
      iceServers,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    })

    const peer: ScreenSharePeer = {
      userId: targetUserId,
      userName: targetUserName,
      connection: pc,
      role
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`[ScreenShare] Sending ICE candidate to ${targetUserName}`)
        sendSignalingMessage({
          type: 'screen-share-ice',
          userId: clientId.value,
          targetUserId,
          candidate: event.candidate
        })
      }
    }

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`[ScreenShare] Connection state with ${targetUserName}: ${pc.connectionState}`)
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeer(targetUserId)
      }
    }

    // Handle incoming stream (for viewers)
    pc.ontrack = (event) => {
      console.log(`[ScreenShare] Received track from ${targetUserName}`)
      if (event.streams[0]) {
        remoteStream.value = event.streams[0]
        shareStatus.value = 'viewing'
      }
    }

    peers.value.set(targetUserId, peer)
    return pc
  }

  // Start sharing screen
  const startScreenShare = async () => {
    try {
      await startCapture()

      if (!stream.value) {
        throw new Error('Failed to capture screen')
      }

      localStream.value = stream.value
      shareStatus.value = 'sharing'

      // Notify server that we're sharing
      await sendSignalingMessage({
        type: 'screen-share-start',
        userId: clientId.value,
        userName: userName.value
      })

      // Monitor stream for ended event (user stops sharing via browser UI)
      stream.value.getVideoTracks().forEach((track) => {
        track.onended = () => {
          console.log('[ScreenShare] User ended screen share')
          stopScreenShare()
        }
      })

      console.log('[ScreenShare] Started sharing screen')
      return true
    } catch (error) {
      console.error('[ScreenShare] Failed to start screen share:', error)
      shareStatus.value = 'idle'
      return false
    }
  }

  // Stop sharing screen
  const stopScreenShare = async () => {
    stopCapture()

    // Close all peer connections
    peers.value.forEach((peer) => {
      peer.connection.close()
    })
    peers.value.clear()

    localStream.value = null
    shareStatus.value = 'idle'
    viewerCount.value = 0

    // Notify server
    await sendSignalingMessage({
      type: 'screen-share-stop',
      userId: clientId.value
    })

    console.log('[ScreenShare] Stopped sharing screen')
  }

  // Handle viewer wanting to watch shared screen
  const requestViewScreen = async (sharerUserId: string, sharerUserName: string) => {
    console.log(`[ScreenShare] Requesting to view ${sharerUserName}'s screen`)

    const pc = await createPeerConnection(sharerUserId, sharerUserName, 'viewer')

    // Create offer
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    // Send offer to sharer
    await sendSignalingMessage({
      type: 'screen-share-offer',
      targetUserId: sharerUserId,
      offer: offer,
      userId: clientId.value,
      userName: userName.value
    })
  }

  // Handle incoming offer from viewer
  const handleViewerOffer = async (data: ScreenShareMessage) => {
    if (data.type !== 'screen-share-offer') return

    console.log(`[ScreenShare] Received offer from ${data.userName}`)

    if (shareStatus.value !== 'sharing' || !localStream.value) {
      console.error('[ScreenShare] Not currently sharing')
      return
    }

    const pc = await createPeerConnection(data.userId, data.userName, 'sharer')

    // Add local stream tracks to connection
    localStream.value.getTracks().forEach((track) => {
      pc.addTrack(track, localStream.value!)
    })

    // Set remote description and create answer
    await pc.setRemoteDescription(data.offer)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    // Send answer back to viewer
    await sendSignalingMessage({
      type: 'screen-share-answer',
      targetUserId: data.userId,
      answer: answer,
      userId: clientId.value
    })

    viewerCount.value = peers.value.size
  }

  // Handle incoming answer from sharer
  const handleSharerAnswer = async (data: ScreenShareMessage) => {
    if (data.type !== 'screen-share-answer') return

    console.log(`[ScreenShare] Received answer from sharer`)

    const peer = peers.value.get(data.userId)
    if (!peer) {
      console.error('[ScreenShare] No peer connection found for', data.userId)
      return
    }

    await peer.connection.setRemoteDescription(data.answer)
  }

  // Handle incoming ICE candidate
  const handleIceCandidate = async (data: ScreenShareMessage) => {
    if (data.type !== 'screen-share-ice-candidate') return

    const peer = peers.value.get(data.userId)
    if (!peer) {
      console.log('[ScreenShare] No peer connection found for ICE candidate from', data.userId)
      return
    }

    try {
      await peer.connection.addIceCandidate(data.candidate)
      console.log(`[ScreenShare] Added ICE candidate from ${data.userId}`)
    } catch (error) {
      console.error('[ScreenShare] Failed to add ICE candidate:', error)
    }
  }

  // Handle screen share stopped by sharer
  const handleScreenShareStop = (data: ScreenShareMessage) => {
    if (data.type !== 'screen-share-stop') return

    if (shareStatus.value === 'viewing' && peers.value.has(data.userId)) {
      console.log(`[ScreenShare] ${data.userName} stopped sharing`)
      removePeer(data.userId)
      remoteStream.value = null
      shareStatus.value = 'idle'
    }
  }

  // Remove a peer connection
  const removePeer = (userId: string) => {
    const peer = peers.value.get(userId)
    if (peer) {
      peer.connection.close()
      peers.value.delete(userId)

      if (shareStatus.value === 'sharing') {
        viewerCount.value = peers.value.size
      }
    }
  }

  // Send signaling message through your chat system
  const sendSignalingMessage = async (message: SignalingMessage) => {
    // This will need to be integrated with your SSE/chat system
    // For now, using a dedicated endpoint
    try {
      await $fetch('/api/screen-share-signal', {
        method: 'POST',
        body: message
      })
    } catch (error) {
      console.error('[ScreenShare] Failed to send signaling message:', error)
    }
  }

  // Monitor connection statistics
  const updateConnectionStats = async () => {
    if (peers.value.size === 0) return

    // Get stats from first peer connection
    const firstPeer = Array.from(peers.value.values())[0]
    if (!firstPeer) return

    try {
      const stats = await firstPeer.connection.getStats()
      stats.forEach((report) => {
        if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
          connectionStats.value.bitrate = Math.round(report.bytesSent * 8 / 1000) // kbps
          connectionStats.value.framerate = report.framesPerSecond || 0
        }
        if (report.type === 'media-source' && report.kind === 'video') {
          connectionStats.value.resolution = `${report.width}x${report.height}`
        }
      })
    } catch (error) {
      console.error('[ScreenShare] Failed to get stats:', error)
    }
  }

  // Start monitoring stats
  let statsInterval: NodeJS.Timeout | null = null
  watch(shareStatus, (newStatus) => {
    if (newStatus !== 'idle') {
      statsInterval = setInterval(updateConnectionStats, 1000)
    } else {
      if (statsInterval) {
        clearInterval(statsInterval)
        statsInterval = null
      }
    }
  })

  onUnmounted(() => {
    // Development-safe cleanup - preserve connections during HMR
    if (import.meta.env.PROD || !import.meta.hot) {
      stopScreenShare()
    }

    // Always clear stats interval to prevent memory leaks
    if (statsInterval) {
      clearInterval(statsInterval)
    }
  })

  return {
    // State
    localStream: readonly(localStream),
    remoteStream: readonly(remoteStream),
    shareStatus: readonly(shareStatus),
    viewerCount: readonly(viewerCount),
    connectionStats: readonly(connectionStats),
    enabled,

    // Actions
    startScreenShare,
    stopScreenShare,
    requestViewScreen,

    // Handlers for signaling
    handleViewerOffer,
    handleSharerAnswer,
    handleIceCandidate,
    handleScreenShareStop
  }
}
