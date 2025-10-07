import { IngressInput, IngressClient, type IngressInfo as LKIngressInfo } from 'livekit-server-sdk'
import type { CreateIngressRequest, CreateIngressResponse, IngressInfo } from '#shared/types/ingress'

export default defineEventHandler(async (event): Promise<CreateIngressResponse> => {
  try {
    const body = await readBody<CreateIngressRequest>(event)
    const { roomName } = body

    // Validate required fields
    if (!roomName) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required field: roomName'
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

    // Create IngressClient
    const livekitApiUrl = livekitUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')
    const ingressClient = new IngressClient(livekitApiUrl, livekitKey, livekitSecret)

    // Fixed participant identity for OBS stream
    const participantIdentity = 'obs-stream'
    const ingressName = `${roomName}-whip`

    // Check if ingress already exists for this room
    try {
      const existingIngresses = await ingressClient.listIngress({ roomName })
      const existing = existingIngresses.find(
        (i: LKIngressInfo) => i.participantIdentity === participantIdentity && i.name === ingressName
      )

      if (existing && existing.ingressId && existing.streamKey && existing.url) {
        // Return existing ingress
        const ingressInfo: IngressInfo = {
          ingressId: existing.ingressId,
          streamKey: existing.streamKey,
          url: existing.url,
          roomName,
          participantIdentity
        }
        return { ingress: ingressInfo }
      }
    } catch (error) {
      // If listing fails, continue to create new ingress
      console.error('[WHIP Ingress] Error listing existing ingresses:', error)
    }

    // Create new WHIP ingress
    const ingress = await ingressClient.createIngress(IngressInput.WHIP_INPUT, {
      name: ingressName,
      roomName,
      participantIdentity,
      participantName: 'OBS Stream',
      enableTranscoding: false // Bypass transcoding for lower latency (WHIP only)
    })

    if (!ingress.ingressId || !ingress.streamKey) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Ingress created but missing ingressId or streamKey'
      })
    }

    if (!ingress.url) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Server did not provide WHIP URL. Check whip_base_url in LiveKit config.'
      })
    }

    // For WHIP, use the URL as-is from the server
    // The stream key is sent as Bearer token in Authorization header by OBS
    const ingressInfo: IngressInfo = {
      ingressId: ingress.ingressId,
      streamKey: ingress.streamKey, // Use the raw stream key from ingress
      url: ingress.url,
      roomName,
      participantIdentity
    }

    return { ingress: ingressInfo }
  } catch (error) {
    console.error('[WHIP Ingress] Error creating ingress:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create WHIP ingress. Ensure LiveKit server has ingress service enabled.'
    })
  }
})
