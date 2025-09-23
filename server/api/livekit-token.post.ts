import { AccessToken } from 'livekit-server-sdk'

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
    const { livekitKey, livekitSecret } = config

    if (!livekitKey || !livekitSecret) {
      throw createError({
        statusCode: 500,
        statusMessage: 'LiveKit credentials not configured'
      })
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
