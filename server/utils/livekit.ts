import { RoomServiceClient } from 'livekit-server-sdk'

let roomServiceClient: RoomServiceClient | null = null

/**
 * Get or create a singleton RoomServiceClient instance
 * Converts ws:// or wss:// URLs to http:// or https:// for API calls
 */
export function getRoomServiceClient(): RoomServiceClient {
  if (!roomServiceClient) {
    const config = useRuntimeConfig()
    const { livekitKey, livekitSecret, public: { livekitUrl } } = config

    if (!livekitKey || !livekitSecret || !livekitUrl) {
      throw createError({
        statusCode: 500,
        statusMessage: 'LiveKit credentials not configured'
      })
    }

    // Convert WebSocket URL to HTTP URL for API calls
    const livekitApiUrl = livekitUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')

    roomServiceClient = new RoomServiceClient(
      livekitApiUrl,
      livekitKey,
      livekitSecret
    )
  }

  return roomServiceClient
}
