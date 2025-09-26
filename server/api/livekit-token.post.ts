import { AccessToken, RoomServiceClient, ParticipantInfo_State } from 'livekit-server-sdk'

interface TokenRequest {
  roomName: string
  participantName: string
  participantMetadata?: Record<string, unknown>
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<TokenRequest>(event)
    const { roomName, participantName, participantMetadata } = body

    // Validate required fields
    if (!roomName || !participantName) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required fields: roomName and participantName'
      })
    }

    // Get runtime config for API credentials
    const config = useRuntimeConfig()
    const { livekitKey, livekitSecret, public: { livekitUrl } } = config

    if (!livekitKey || !livekitSecret || !livekitUrl) {
      throw createError({
        statusCode: 500,
        statusMessage: 'LiveKit credentials not configured'
      })
    }

    // Validate username uniqueness
    const livekitApiUrl = livekitUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')
    const roomService = new RoomServiceClient(
      livekitApiUrl,
      livekitKey,
      livekitSecret
    )

    try {
      const participants = await roomService.listParticipants(roomName)
      const lowerParticipantName = participantName.toLowerCase()

      console.log('[LiveKit Token] Room participants:', participants.map(p => ({
        name: p.name,
        identity: p.identity,
        state: p.state,
        joinedAt: p.joinedAt,
        metadata: p.metadata
      })))
      console.log('[LiveKit Token] Checking participantName:', participantName)

      const nameExists = participants.some((p) => {
        // Skip disconnected participants
        if (p.state === ParticipantInfo_State.DISCONNECTED) {
          console.log('[LiveKit Token] Skipping disconnected participant:', p.identity)
          return false
        }

        console.log('[LiveKit Token] Comparing identity:', p.identity?.toLowerCase(), 'vs', lowerParticipantName, 'state:', p.state)
        if (p.identity?.toLowerCase() === lowerParticipantName) {
          // Check if it's the same user reconnecting
          if (participantMetadata && p.metadata) {
            try {
              const existingMeta = JSON.parse(p.metadata)
              console.log('[LiveKit Token] Metadata check:', existingMeta.userId, 'vs', participantMetadata.userId)
              if (existingMeta.userId === participantMetadata.userId) {
                return false // Allow reconnection
              }
            } catch {
              // Invalid metadata
            }
          }
          return true
        }
        return false
      })

      if (nameExists) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Username is already taken in this room'
        })
      }
    } catch (error) {
      // If room doesn't exist yet, that's fine
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 409) {
        throw error // Re-throw username conflict error
      }
      // For other errors (like room not found), continue with token generation
    }

    // Create AccessToken following LiveKit documentation
    const at = new AccessToken(livekitKey, livekitSecret, {
      identity: participantName,
      ttl: '10m', // 10-minute token expiration as recommended
      metadata: participantMetadata ? JSON.stringify(participantMetadata) : undefined
    })

    // Add video grants as specified in documentation
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    })

    // Generate the JWT token
    const token = await at.toJwt()

    return {
      token,
      roomName,
      participantName,
      serverUrl: config.public.livekitUrl
    }
  } catch (error) {
    console.error('[LiveKit Token] Error generating token:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error // Re-throw HTTP errors
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to generate LiveKit token'
    })
  }
})
