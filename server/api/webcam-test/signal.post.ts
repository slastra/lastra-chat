// @ts-ignore - Global types are declared in types/global.d.ts
import type { StoredSignalMessage } from '../../../types/webrtc'

// Share message queue across endpoints using global
const messageQueues = global.webcamTestQueues || new Map<string, StoredSignalMessage[]>()
if (!global.webcamTestQueues) {
  global.webcamTestQueues = messageQueues
}

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
  const filtered = queue.filter(msg => msg.timestamp > cutoff)
  messageQueues.set(roomId, filtered)

  console.log(`[WebcamTest] Signal ${type} from ${senderId} in room ${roomId}`)

  return { success: true }
})
