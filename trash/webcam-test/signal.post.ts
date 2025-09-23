import type { StoredSignalMessage } from '../../../shared/types/webrtc'
import { getWebcamTestQueues } from '../../utils/globalStore'

// Share message queue across endpoints using global
const messageQueues = getWebcamTestQueues()

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { roomId, senderId, type, data } = body

  if (!roomId || !senderId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Room ID and Sender ID are required'
    })
  }

  // Initialize room queue if it doesn't exist
  if (!messageQueues.has(roomId)) {
    messageQueues.set(roomId, [])
  }

  // Add message to queue
  const message = {
    type,
    roomId,
    senderId,
    data,
    timestamp: Date.now()
  }

  const queue = messageQueues.get(roomId)!
  queue.push(message)

  // Clean up old messages (older than 30 seconds)
  const cutoff = Date.now() - 30000
  const filtered = queue.filter((msg: StoredSignalMessage) => msg.timestamp > cutoff)
  messageQueues.set(roomId, filtered)

  return { success: true }
})
