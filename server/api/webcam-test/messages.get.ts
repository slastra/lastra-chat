// @ts-ignore - Global types are declared in types/global.d.ts
import type { StoredSignalMessage } from '../../../types/webrtc'

// Share the message queue from signal.post.ts
const messageQueues = global.webcamTestQueues || new Map<string, StoredSignalMessage[]>()
if (!global.webcamTestQueues) {
  global.webcamTestQueues = messageQueues
}

const clientLastSeen = new Map<string, number>()

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const { roomId, clientId } = query

  if (!roomId || !clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Room ID and Client ID are required'
    })
  }

  // Get messages for this room
  const messages = messageQueues.get(roomId as string) || []

  // Get last seen timestamp for this client
  const lastSeen = clientLastSeen.get(`${roomId}:${clientId}`) || 0

  // Filter messages that are new for this client (and not from this client)
  const newMessages = messages.filter(msg =>
    msg.timestamp > lastSeen && msg.senderId !== clientId
  )

  // Update last seen timestamp
  if (messages.length > 0) {
    const latestTimestamp = Math.max(...messages.map(m => m.timestamp))
    clientLastSeen.set(`${roomId}:${clientId}`, latestTimestamp)
  }

  // Clean up old last seen entries (older than 5 minutes)
  const cutoff = Date.now() - 300000
  for (const [key, timestamp] of clientLastSeen.entries()) {
    if (timestamp < cutoff) {
      clientLastSeen.delete(key)
    }
  }

  return newMessages
})
