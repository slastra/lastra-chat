import type { ChatMessage } from './chat-stream.get'
import { messages, connectedClients } from './chat-stream.get'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { userName } = body

  // Validate request
  if (!userName) {
    throw createError({
      statusCode: 400,
      statusMessage: 'userName is required'
    })
  }

  console.log(`[CLEAR] ${userName} cleared the chat for all participants`)

  // Clear the messages array on the server
  messages.length = 0

  // Create a system message about the clear
  const clearMessage: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random()}`,
    userId: 'system',
    userName: 'System',
    content: `${userName} cleared the chat`,
    timestamp: Date.now(),
    type: 'system'
  }

  // Add the clear message to history
  messages.push(clearMessage)

  // Broadcast a special clear event to all connected clients
  const broadcastPromises = []
  for (const client of connectedClients) {
    // Check if client has initialDataSent property
    if ('initialDataSent' in client && client.initialDataSent) {
      // Send a clear event
      broadcastPromises.push(
        client.stream.push({
          event: 'clear',
          data: JSON.stringify({
            clearedBy: userName,
            message: clearMessage
          })
        }).catch((err) => {
          console.error(`[CLEAR] Failed to send clear event to ${client.userName}:`, err)
        })
      )
    }
  }

  await Promise.allSettled(broadcastPromises)

  return {
    success: true,
    message: 'Chat cleared for all participants'
  }
})