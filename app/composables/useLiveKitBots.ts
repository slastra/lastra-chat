import type { UseLiveKitChatReturn, LiveKitChatMessage } from './useLiveKitChat'
import type { UseLiveKitRoomReturn } from './useLiveKitRoom'
import type { BotConfig } from './useBots'

interface UseLiveKitBotsOptions {
  liveKitChat: UseLiveKitChatReturn
  liveKitRoom: UseLiveKitRoomReturn
  userId: string
  userName: string
}

export function useLiveKitBots(options: UseLiveKitBotsOptions) {
  const { liveKitChat, liveKitRoom, userId: _userId, userName } = options

  // Re-use existing bot logic
  const { bots, loadBots, toggleBot, isBotEnabled, detectBotMention } = useBots()

  // Track bot response state
  const activeBotResponses = ref<Set<string>>(new Set())
  const lastMessages = ref<LiveKitChatMessage[]>([])

  // Track timeout IDs for cleanup
  const timeoutIds = ref<Set<NodeJS.Timeout>>(new Set())

  // Calculate interjection probability for a bot
  const calculateInterjectionProbability = (bot: BotConfig, participantCount: number, recentMessages: LiveKitChatMessage[]): number => {
    if (!isBotEnabled(bot.name)) return 0

    // Always respond when user is alone (1 participant)
    if (participantCount === 1) return 1.0

    // Don't interrupt if bot just responded
    if (activeBotResponses.value.has(bot.name)) {
      return 0
    }

    // Check recent messages (last 5)
    const recent = recentMessages.slice(-5)

    // Don't respond if bot already responded recently
    const botRecentlyResponded = recent.some(msg =>
      msg.type === 'bot' && msg.metadata?.botName === bot.name
    )
    if (botRecentlyResponded) return 0

    // Base probability decreases with more participants
    // Formula: probability = (1 / (1 + 0.5 * (participantCount - 1))) * (1 - shyness)
    const factor = 0.5
    const baseProbability = 1 / (1 + factor * (participantCount - 1))

    // Apply shyness factor
    let probability = baseProbability * (1 - bot.shyness)

    // Increase probability if bot is mentioned
    const lastMessage = recent[recent.length - 1]
    if (lastMessage && detectBotMention(lastMessage.content)?.name === bot.name) {
      probability = 0.8 // High probability when directly mentioned
    }

    // Increase probability if conversation matches bot interests
    const conversationText = recent.map(m => m.content).join(' ').toLowerCase()
    if (bot.role) {
      const botInterests = bot.role.toLowerCase().split(' ')
      const matchingWords = botInterests.filter((word: string) =>
        word.length > 3 && conversationText.includes(word)
      )
      probability += matchingWords.length * 0.1
    }

    return Math.min(probability, 0.9) // Cap at 90%
  }

  // NEW: Check for bot triggers when USER SENDS a message
  const checkOutgoingMessage = async (content: string, roomName: string) => {
    const participantCount = liveKitRoom.participantCount.value

    // Capture context BEFORE the new message is added
    // We'll pass this snapshot to avoid including the triggering message in context
    const contextSnapshot = [...lastMessages.value]

    // Check for bot mentions first (always respond to mentions)
    const mentionedBot = detectBotMention(content)
    if (mentionedBot && isBotEnabled(mentionedBot.name)) {
      await triggerBotResponse(mentionedBot, content, roomName, true, contextSnapshot)
      return
    }

    // When user is alone, always trigger a random bot
    if (participantCount === 1) {
      const enabledBots = bots.value.filter(bot => isBotEnabled(bot.name))
      if (enabledBots.length > 0) {
        const randomBot = enabledBots[Math.floor(Math.random() * enabledBots.length)]
        await triggerBotResponse(randomBot as BotConfig, content, roomName, false, contextSnapshot)
        return
      }
    }

    // For multiple participants, check interjection probability
    for (const bot of bots.value) {
      if (!isBotEnabled(bot.name)) continue

      const probability = calculateInterjectionProbability(bot as BotConfig, participantCount, contextSnapshot)
      if (Math.random() < probability) {
        await triggerBotResponse(bot as BotConfig, content, roomName, false, contextSnapshot)
        break // Only one bot responds
      }
    }
  }

  // Call bot API with user's context
  const triggerBotResponse = async (
    bot: BotConfig,
    userMessage: string,
    roomName: string,
    isMention: boolean,
    contextMessages?: LiveKitChatMessage[]
  ) => {
    try {
      // Mark bot as actively responding
      activeBotResponses.value.add(bot.name)

      // Use the provided context snapshot if available
      // Otherwise, use current history but exclude the very last message if it matches what we're responding to
      let messagesForContext = contextMessages || lastMessages.value

      // If using current history and the last message matches what triggered the bot, exclude it
      if (!contextMessages && messagesForContext.length > 0) {
        const lastMsg = messagesForContext[messagesForContext.length - 1]
        if (lastMsg && lastMsg.content === userMessage && lastMsg.userName === userName) {
          messagesForContext = messagesForContext.slice(0, -1)
        }
      }

      const context = messagesForContext.slice(-10).map(msg => ({
        role: msg.type === 'bot' ? 'model' : 'user',
        userName: msg.userName,
        content: msg.content
      }))

      // Note: Current message is NOT added here - server handles it to avoid duplication

      // Call server API to generate AND send bot response
      await $fetch('/api/chat', {
        method: 'POST',
        body: {
          roomName,
          message: `${userName}: ${userMessage}`, // Include userName in the message
          context,
          botName: bot.name,
          isInterjection: !isMention
        }
      })
    } catch (error) {
      console.error(`[LiveKit Bots] Failed to trigger bot response:`, error)
    } finally {
      // Clear active response after delay
      const timeoutId = setTimeout(() => {
        activeBotResponses.value.delete(bot.name)
        timeoutIds.value.delete(timeoutId)
      }, 5000) // 5 second cooldown
      timeoutIds.value.add(timeoutId)
    }
  }

  // Only track incoming messages for history (don't trigger bots)
  const trackIncomingMessage = (message: LiveKitChatMessage) => {
    // Update message history for all messages
    // We need to track our own messages too for context continuity
    lastMessages.value.push(message)
    if (lastMessages.value.length > 20) {
      lastMessages.value = lastMessages.value.slice(-20)
    }
  }

  // Message handler for event system - only tracks history now
  const messageHandler = (...args: unknown[]) => {
    const message = args[0] as LiveKitChatMessage
    trackIncomingMessage(message)
  }

  // Setup message listener
  const startListening = () => {
    liveKitChat.on('messageReceived', messageHandler)
  }

  // Stop listening
  const stopListening = () => {
    liveKitChat.off('messageReceived', messageHandler)
  }

  // Initialize bots
  onMounted(async () => {
    await loadBots()
    startListening()
  })

  // Cleanup
  onUnmounted(() => {
    stopListening()
    // Clear all pending timeouts
    timeoutIds.value.forEach(clearTimeout)
    timeoutIds.value.clear()
  })

  return {
    // Bot state
    bots,
    activeBotResponses: readonly(activeBotResponses),

    // Bot controls
    toggleBot,
    isBotEnabled,
    detectBotMention,

    // NEW: Export for ChatInput
    checkOutgoingMessage,

    // Lifecycle
    startListening,
    stopListening
  }
}
