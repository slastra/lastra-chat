import type { ChatMessage } from './chat-stream.get'
import { messages, connectedClients, botStates } from './chat-stream.get'
import { botManager } from '../utils/bot-response-manager'
import { sendChatNotification } from '../utils/ntfy'

const MAX_MESSAGE_HISTORY = 256

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { userId, userName, content } = body

  // Validate request
  if (!userId || !userName || !content) {
    throw createError({
      statusCode: 400,
      statusMessage: 'userId, userName, and content are required'
    })
  }

  // Create user message
  const message: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random()}`,
    userId,
    userName,
    content,
    timestamp: Date.now(),
    type: 'user'
  }

  // Store message
  messages.push(message)

  // Trim messages if exceeding limit
  if (messages.length > MAX_MESSAGE_HISTORY) {
    messages.splice(0, messages.length - MAX_MESSAGE_HISTORY)
  }

  // Broadcast to all clients except the sender
  for (const client of connectedClients) {
    if (client.userId !== userId) {
      await client.stream.push({
        event: 'message',
        data: JSON.stringify(message)
      }).catch(() => {})
    }
  }

  // Send notification to ntfy.sh (fire and forget)
  sendChatNotification(userName, content, 'user').catch(err =>
    console.error('[CHAT] Failed to send ntfy notification:', err)
  )

  // Get list of disabled bots from global state
  const disabledBots: string[] = []
  for (const [botName, enabled] of botStates) {
    if (!enabled) {
      disabledBots.push(botName)
    }
  }

  // Let the bot manager handle all bot response logic
  await botManager.handleMessage(message, disabledBots, event)

  return { success: true, messageId: message.id }
})
