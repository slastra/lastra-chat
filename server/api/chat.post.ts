import { generateBotResponse } from '../utils/gemini'
import { loadBots } from '../utils/bots'
import { sendBotMessage } from '../utils/livekitBot'

function cleanBotResponse(response: string, botName: string): string {
  // Remove bot name prefix in various formats (Name:, **Name:**, *Name:*, etc.)
  // Case-insensitive match at the start of the string
  // Escape special regex characters in the bot name
  const escapedName = botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const namePattern = new RegExp(`^\\*{0,2}${escapedName}\\*{0,2}\\s*:\\s*`, 'i')
  return response.replace(namePattern, '').trim()
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)

    const { roomName, message, context, botName, _isInterjection } = body

    if (!message || !botName || !roomName) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Message, botName, and roomName are required'
      })
    }

    const bots = await loadBots(event)
    const bot = bots.find(b => b.name === botName)

    if (!bot) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Bot not found'
      })
    }

    // Convert context to ChatMessage format expected by generateBotResponse
    const recentMessages = (context || []).map((msg: { role: string, userName: string, content: string }) => ({
      id: `msg-${Date.now()}-${Math.random()}`,
      userId: msg.role === 'model' ? `bot-${msg.userName}` : 'user',
      userName: msg.userName,
      content: msg.content,
      timestamp: Date.now(),
      type: msg.role === 'model' ? 'bot' : 'user' as const
    }))

    // Extract userName from the message if it's in "Name: content" format
    let userName = 'User'
    let messageContent = message
    const colonIndex = message.indexOf(':')
    if (colonIndex > 0 && colonIndex < 20) { // Reasonable name length
      userName = message.substring(0, colonIndex).trim()
      messageContent = message.substring(colonIndex + 1).trim()
    }

    // Add current message
    const currentMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      userId: 'user',
      userName,
      content: messageContent,
      timestamp: Date.now(),
      type: 'user' as const
    }

    // DON'T add current message to recentMessages - it will be passed separately
    // recentMessages.push(currentMessage) // REMOVED - this was causing duplication

    const response = await generateBotResponse({
      bot,
      message: currentMessage,
      recentMessages, // This now contains only the context, not the current message
      userCount: 1 // Could be enhanced to get actual user count if available
    })

    // Clean bot response to remove name prefix and trim
    const cleanedResponse = cleanBotResponse(response, botName)

    // Send bot message directly to room via server SDK
    await sendBotMessage(roomName, botName, cleanedResponse)

    return { success: true }
  } catch (error) {
    console.error('[chat.post] Failed to generate bot response:', error)

    // Return fallback response instead of throwing
    return {
      content: 'Sorry, I\'m having trouble responding right now.'
    }
  }
})
