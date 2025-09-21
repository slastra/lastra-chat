import type { StoredSignalMessage } from '../../../shared/types/webrtc'
import { getScreenShareTestQueues } from '../../utils/globalStore'

// Share the message queue from signal.post.ts
const messageQueues = getScreenShareTestQueues()

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
  const newMessages = messages.filter((msg: StoredSignalMessage) =>
    msg.timestamp > lastSeen && msg.senderId !== clientId
  )

  // Update last seen timestamp
  if (messages.length > 0) {
    const latestTimestamp = Math.max(...messages.map((m: StoredSignalMessage) => m.timestamp))
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
