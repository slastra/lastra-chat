export const useTurnTest = () => {
  const connectionState = ref<RTCPeerConnectionState>('new')
  const iceGatheringState = ref<RTCIceGatheringState>('new')
  const iceCandidates = ref<RTCIceCandidate[]>([])
  const testResults = ref<{
    stun: boolean
    turn: boolean
    relay: boolean
    errors: string[]
  }>({
    stun: false,
    turn: false,
    relay: false,
    errors: []
  })

  let peerConnection: RTCPeerConnection | null = null

  // Generate TURN credentials using static-auth-secret
  // Using Web Crypto API for browser compatibility
  const generateTurnCredentials = async (secret: string) => {
    // Create username as timestamp:userId format
    const unixTimestamp = Math.floor(Date.now() / 1000) + 24 * 3600 // Valid for 24 hours
    const username = `${unixTimestamp}:testuser`

    // Convert secret to ArrayBuffer
    const encoder = new TextEncoder()
    const keyData = encoder.encode(secret)

    // Import the secret as a crypto key
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    )

    // Sign the username
    const messageData = encoder.encode(username)
    const signature = await crypto.subtle.sign('HMAC', key, messageData)

    // Convert to base64
    const password = btoa(String.fromCharCode(...new Uint8Array(signature)))

    return { username, password }
  }

  const testConnection = async () => {
    // Clean up any existing connection
    if (peerConnection) {
      peerConnection.close()
      peerConnection = null
    }

    // Reset test results
    iceCandidates.value = []
    testResults.value = {
      stun: false,
      turn: false,
      relay: false,
      errors: []
    }

    const staticAuthSecret = 'f7a8c3d9e2b5a4f1c6d8e9b0a2c4d6e8f0a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1'
    const { username, password } = await generateTurnCredentials(staticAuthSecret)

    console.log('TURN Credentials:', { username, password })

    const iceServers: RTCIceServer[] = [
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
      }
    ]

    // Add TURNS (TURN over TLS) - always include since you have TLS configured
    iceServers.push({
      urls: 'turns:turn.lastra.us:5349?transport=tcp',
      username,
      credential: password
    })

    try {
      peerConnection = new RTCPeerConnection({
        iceServers,
        iceTransportPolicy: 'all', // Use both STUN and TURN
        iceCandidatePoolSize: 10
      })

      // Monitor connection state
      peerConnection.onconnectionstatechange = () => {
        if (peerConnection) {
          connectionState.value = peerConnection.connectionState
          console.log('Connection state:', peerConnection.connectionState)
        }
      }

      // Monitor ICE gathering state
      peerConnection.onicegatheringstatechange = () => {
        if (peerConnection) {
          iceGatheringState.value = peerConnection.iceGatheringState
          console.log('ICE gathering state:', peerConnection.iceGatheringState)
        }
      }

      // Collect ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          iceCandidates.value.push(event.candidate)
          console.log('ICE candidate:', event.candidate)

          // Analyze candidate type
          const candidate = event.candidate
          console.log(`Candidate type: ${candidate.type}, address: ${candidate.address}, protocol: ${candidate.protocol}`)

          if (candidate.type === 'srflx') {
            testResults.value.stun = true
            console.log('✓ STUN is working - found server reflexive candidate')
            console.log('  STUN server that responded:', candidate)
          } else if (candidate.type === 'relay') {
            testResults.value.relay = true
            testResults.value.turn = true
            console.log('✓ TURN is working - found relay candidate')
          } else if (candidate.type === 'host') {
            console.log('Found host candidate (local IP)')
          }
        } else {
          console.log('ICE gathering completed')

          // Check if we got the expected candidate types
          if (!testResults.value.stun) {
            testResults.value.errors.push('No STUN candidates found - check STUN server')
          }
          if (!testResults.value.relay) {
            testResults.value.errors.push('No relay candidates found - check TURN credentials or server')
          }
        }
      }

      // Create a data channel to trigger ICE gathering
      const _dataChannel = peerConnection.createDataChannel('test')

      // Create an offer to start the ICE gathering process
      const offer = await peerConnection.createOffer()
      await peerConnection.setLocalDescription(offer)

      console.log('Starting ICE candidate gathering...')

      // Set a timeout to check results
      setTimeout(() => {
        if (iceCandidates.value.length === 0) {
          testResults.value.errors.push('No ICE candidates gathered - possible network issue')
        }
      }, 10000)
    } catch (error) {
      console.error('Error testing TURN connection:', error)
      testResults.value.errors.push(`Connection error: ${error}`)
    }
  }

  const forceRelayTest = async () => {
    // Test with relay-only to specifically test TURN
    if (peerConnection) {
      peerConnection.close()
      peerConnection = null
    }

    iceCandidates.value = []
    testResults.value = {
      stun: false,
      turn: false,
      relay: false,
      errors: []
    }

    const staticAuthSecret = 'f7a8c3d9e2b5a4f1c6d8e9b0a2c4d6e8f0a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1'
    const { username, password } = await generateTurnCredentials(staticAuthSecret)

    const iceServers: RTCIceServer[] = [
      {
        urls: [
          'turn:turn.lastra.us:3478?transport=udp',
          'turn:turn.lastra.us:3478?transport=tcp'
        ],
        username,
        credential: password
      }
    ]

    try {
      peerConnection = new RTCPeerConnection({
        iceServers,
        iceTransportPolicy: 'relay', // Force TURN relay only
        iceCandidatePoolSize: 10
      })

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          iceCandidates.value.push(event.candidate)
          if (event.candidate.type === 'relay') {
            testResults.value.relay = true
            testResults.value.turn = true
            console.log('✓ TURN relay is working!')
          }
        }
      }

      const _dataChannel = peerConnection.createDataChannel('relay-test')
      const offer = await peerConnection.createOffer()
      await peerConnection.setLocalDescription(offer)

      console.log('Testing TURN relay only...')
    } catch (error) {
      console.error('Error in relay test:', error)
      testResults.value.errors.push(`Relay test error: ${error}`)
    }
  }

  const cleanup = () => {
    if (peerConnection) {
      peerConnection.close()
      peerConnection = null
    }
  }

  onUnmounted(() => {
    cleanup()
  })

  return {
    connectionState: readonly(connectionState),
    iceGatheringState: readonly(iceGatheringState),
    iceCandidates: readonly(iceCandidates),
    testResults: readonly(testResults),
    testConnection,
    forceRelayTest,
    cleanup
  }
}
