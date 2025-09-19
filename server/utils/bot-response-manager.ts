import type { ChatMessage } from '../api/chat-stream.get'
import { messages, connectedClients, userPresence } from '../api/chat-stream.get'
import { GoogleGenAI } from '@google/genai'
import { findAllBotsByTrigger, checkRandomInterjections, type BotConfig } from './bots'
import { sendChatNotification } from './ntfy'
import type { H3Event } from 'h3'

const MAX_MESSAGE_HISTORY = 256

// Types
interface BotQueueItem {
  bot: BotConfig
  message: ChatMessage
  isInterjection: boolean
  disabledBots: string[]
  event?: H3Event
}

interface BotSelection {
  bot: BotConfig
  reason: 'mention' | 'interjection'
  priority: number
}

interface ResponseContext {
  message: ChatMessage
  isInterjection: boolean
  disabledBots: string[]
  event?: H3Event
  streamId?: string
}

// Chain tracking logic
class ChainTracker {
  private depth = 0
  private lastBot: string | null = null
  private resetTimeout: NodeJS.Timeout | null = null
  private readonly maxDepth = 4

  canBotRespond(botName: string, messageType: 'user' | 'ai' | 'system'): boolean {
    // User messages always reset the chain
    if (messageType === 'user') return true

    // Check if same bot is trying to respond twice in a row
    if (messageType === 'ai' && botName === this.lastBot) {
      console.log('[CHAIN] Same bot trying to respond twice in a row')
      return false
    }

    // Check chain depth
    if (messageType === 'ai' && this.depth >= this.maxDepth) {
      console.log(`[CHAIN] Max depth (${this.maxDepth}) reached`)
      return false
    }

    return true
  }

  canContinue(): boolean {
    return this.depth < this.maxDepth
  }

  incrementDepth(messageType: 'user' | 'ai' | 'system', botName: string) {
    if (messageType === 'ai') {
      this.depth++
    } else {
      this.depth = 0
    }
    this.lastBot = botName
    this.scheduleReset()
  }

  reset() {
    this.depth = 0
    this.lastBot = null
    if (this.resetTimeout) {
      clearTimeout(this.resetTimeout)
      this.resetTimeout = null
    }
  }

  scheduleReset() {
    if (this.resetTimeout) clearTimeout(this.resetTimeout)
    this.resetTimeout = setTimeout(() => this.reset(), 60000) // Reset after 1 minute
  }
}

// Main bot response manager
export class BotResponseManager {
  private queue: BotQueueItem[] = []
  private processingBots = new Set<string>() // Track which bots are currently processing
  private streamingQueue: string[] = [] // Queue of streamIds waiting to stream
  private currentStreamer: string | null = null // The streamId currently streaming
  private chainTracker = new ChainTracker()
  private isProcessing = false

  // Main entry point for handling messages
  async handleMessage(message: ChatMessage, disabledBots: string[] = [], event?: H3Event) {
    console.log('[BOT MANAGER] Handling message:', message.type, 'from', message.userName)

    // Reset chain for user messages
    if (message.type === 'user') {
      this.chainTracker.reset()
    }

    // Check if API key is available
    const runtimeConfig = useRuntimeConfig()
    const apiKey = runtimeConfig.geminiApiKey || process.env.GEMINI_API_KEY
    if (!apiKey) {
      console.log('[BOT MANAGER] No API key available, skipping bot responses')
      return
    }

    // Select bots that should respond
    const selections = await this.selectBots(message, disabledBots, event)
    if (selections.length === 0) {
      console.log('[BOT MANAGER] No bots selected to respond')
      return
    }

    // Add selected bots to queue
    this.queueBots(selections, message, disabledBots, event)

    // Start processing
    // Add initial delay for interjections (not for direct mentions)
    const hasDirectMention = selections.some(s => s.reason === 'mention')
    const delay = hasDirectMention ? 0 : (1500 + Math.random() * 2000)

    if (delay > 0) {
      console.log(`[BOT MANAGER] Starting queue after ${(delay / 1000).toFixed(1)}s delay`)
      setTimeout(() => this.processQueue(), delay)
    } else {
      this.processQueue()
    }
  }

  // Select which bots should respond
  private async selectBots(
    message: ChatMessage,
    disabledBots: string[],
    event?: H3Event
  ): Promise<BotSelection[]> {
    const selections: BotSelection[] = []

    // Phase 1: Check for direct mentions (can be multiple)
    const mentionedBots = await findAllBotsByTrigger(message.content, event)
    for (const bot of mentionedBots) {
      if (!disabledBots.includes(bot.name)
        && this.chainTracker.canBotRespond(bot.name, message.type)) {
        console.log('[BOT MANAGER] Adding mentioned bot:', bot.name)
        selections.push({
          bot,
          reason: 'mention',
          priority: 1
        })
      }
    }

    // Phase 2: ALWAYS check for random interjections (regardless of mentions)
    const activeUserCount = userPresence.size
    const interjectionBots = await checkRandomInterjections(activeUserCount, disabledBots, event)

    // Add interjection bots (skip if already mentioned)
    for (const bot of interjectionBots) {
      const alreadyMentioned = mentionedBots.some(m => m.name === bot.name)
      if (!alreadyMentioned && this.chainTracker.canBotRespond(bot.name, message.type)) {
        console.log('[BOT MANAGER] Adding interjection bot:', bot.name)
        selections.push({
          bot,
          reason: 'interjection',
          priority: 2
        })
      }
    }

    // Randomize order within priority groups
    return this.shuffleSelections(selections)
  }

  // Add bots to the queue
  private queueBots(
    selections: BotSelection[],
    message: ChatMessage,
    disabledBots: string[],
    event?: H3Event
  ) {
    for (const selection of selections) {
      this.queue.push({
        bot: selection.bot,
        message,
        isInterjection: selection.reason === 'interjection',
        disabledBots,
        event
      })
    }
    console.log(`[BOT MANAGER] Queued ${selections.length} bots, total in queue: ${this.queue.length}`)
  }

  // Process the bot queue with concurrent generation but sequential streaming
  private async processQueue() {
    while (this.queue.length > 0) {
      const item = this.queue.shift()!

      // Skip if this bot is already being processed
      if (this.processingBots.has(item.bot.name)) {
        console.log(`[BOT MANAGER] ${item.bot.name} already processing, skipping`)
        continue
      }

      // Start processing this bot (don't await - let it run concurrently)
      this.processBotItem(item)
    }
  }

  // Process a single bot item
  private async processBotItem(item: BotQueueItem) {
    const botName = item.bot.name
    const streamId = `${botName}-${Date.now()}-${Math.random()}`

    console.log(`[BOT MANAGER] Starting concurrent processing for ${botName} (stream: ${streamId})`)

    // Mark this bot as processing
    this.processingBots.add(botName)

    try {
      // Generate the response (this happens concurrently)
      const responseMessage = await this.generateBotResponse(item.bot, {
        message: item.message,
        isInterjection: item.isInterjection,
        disabledBots: item.disabledBots,
        event: item.event,
        streamId
      })

      // Update chain tracker
      this.chainTracker.incrementDepth(item.message.type, botName)

      // Check for follow-up responses if within chain limit
      if (this.chainTracker.canContinue() && responseMessage) {
        // Small delay before checking for responses to this bot's message
        setTimeout(async () => {
          await this.handleMessage(
            responseMessage,
            [...item.disabledBots, botName], // Prevent bot from responding to itself
            item.event
          )
        }, 500)
      }
    } catch (error) {
      console.error(`[BOT MANAGER] Error processing ${botName}:`, error)
    } finally {
      // Remove from processing set
      this.processingBots.delete(botName)
      console.log(`[BOT MANAGER] Completed processing for ${botName}`)
    }
  }

  // Wait for stream availability (ensures only one bot streams at a time)
  private async waitForStreamAvailability(streamId: string): Promise<void> {
    // Add to streaming queue
    this.streamingQueue.push(streamId)

    // If we're first in queue and no one is streaming, claim the slot
    if (this.streamingQueue[0] === streamId && !this.currentStreamer) {
      this.currentStreamer = streamId
      return
    }

    // Otherwise wait for our turn with timeout safeguard
    const startTime = Date.now()
    const timeout = 30000 // 30 seconds timeout

    while (this.currentStreamer !== streamId) {
      // Check for timeout to prevent infinite loops
      if (Date.now() - startTime > timeout) {
        console.warn(`[BOT MANAGER] Stream wait timeout for ${streamId}, forcing slot availability`)
        this.currentStreamer = streamId
        break
      }

      await new Promise(resolve => setTimeout(resolve, 100))

      // Check if we're next and slot is free
      if (this.streamingQueue[0] === streamId && !this.currentStreamer) {
        this.currentStreamer = streamId
      }
    }
  }

  // Release streaming slot and pass to next in queue
  private releaseStreamingSlot(streamId: string): void {
    // Remove from queue
    const index = this.streamingQueue.indexOf(streamId)
    if (index !== -1) {
      this.streamingQueue.splice(index, 1)
    }

    // Clear current streamer if it's us
    if (this.currentStreamer === streamId) {
      this.currentStreamer = null

      // Pass slot to next in queue if any
      if (this.streamingQueue.length > 0) {
        this.currentStreamer = this.streamingQueue[0] || null
      }
    }
  }

  // Generate a bot's response with stream isolation
  private async generateBotResponse(bot: BotConfig, context: ResponseContext): Promise<ChatMessage | null> {
    const runtimeConfig = useRuntimeConfig()
    const apiKey = runtimeConfig.geminiApiKey || process.env.GEMINI_API_KEY

    if (!apiKey) {
      console.error('[BOT MANAGER] No API key available')
      return null
    }

    const streamId = context.streamId || `${bot.name}-${Date.now()}`

    // Wait for our turn to stream BEFORE creating the message
    await this.waitForStreamAvailability(streamId)

    // NOW create bot message (after we have the streaming slot)
    const botMessage: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      userId: 'ai',
      userName: bot.name,
      content: '',
      timestamp: Date.now(),
      type: 'ai'
    }

    // Add to messages and trim if needed
    console.log(`[BOT MANAGER] Adding ${bot.name} message to array. Current length: ${messages.length}`)
    messages.push(botMessage)
    if (messages.length > MAX_MESSAGE_HISTORY) {
      messages.splice(0, messages.length - MAX_MESSAGE_HISTORY)
    }
    console.log(`[BOT MANAGER] Messages array now has ${messages.length} messages`)

    // Notify clients that bot is starting to stream
    console.log(`[BOT MANAGER] Broadcasting ai-start for ${bot.name} with messageId: ${botMessage.id}`)
    await this.broadcastToAll('ai-start', botMessage)

    try {
      // Initialize Gemini
      const ai = new GoogleGenAI({ apiKey })

      // Get conversation context (exclude the current empty bot message)
      const recentMessages = messages
        .filter(m => m.type !== 'system' && m.id !== botMessage.id)
        .slice(-10)

      // Build Gemini configuration
      const model = bot.model || runtimeConfig.geminiModel || 'gemini-2.5-flash-lite'
      const config = {
        temperature: context.isInterjection ? bot.temperature.interjection : bot.temperature.normal,
        tools: bot.tools?.includes('googleSearch') ? [{ googleSearch: {} }] : undefined,
        systemInstruction: [{
          text: context.isInterjection ? bot.personality.interjection : bot.personality.normal
        }]
      }

      // Build conversation history
      const contents = recentMessages.map(msg => ({
        role: (msg.userId === 'ai' && msg.userName === bot.name) ? 'model' : 'user',
        parts: [{
          text: (msg.userId === 'ai' && msg.userName === bot.name)
            ? msg.content
            : `${msg.userName}: ${msg.content}`
        }]
      }))

      console.log(`[BOT MANAGER] Calling Gemini for ${bot.name} with ${contents.length} messages`)

      // Debug: Log conversation structure
      console.log(`[BOT MANAGER] Conversation for ${bot.name}:`)
      contents.slice(-3).forEach((msg, i) => {
        const text = msg.parts[0]?.text
        if (text) {
          const preview = text.substring(0, 100)
          console.log(`  [${i}] ${msg.role}: ${preview}...`)
        }
      })

      // Generate response
      const response = await ai.models.generateContentStream({
        model,
        config,
        contents
      })

      // Stream response chunks
      let fullContent = ''
      let chunkCount = 0
      for await (const chunk of response) {
        const chunkText = chunk.text || ''
        fullContent += chunkText
        chunkCount++

        await this.broadcastToAll('ai-chunk', {
          messageId: botMessage.id,
          chunk: chunkText,
          botName: bot.name // Add bot name for debugging
        })
      }

      console.log(`[BOT MANAGER] ${bot.name} streamed ${chunkCount} chunks, total content length: ${fullContent.length}`)
      console.log(`[BOT MANAGER] Raw content before prefix removal: "${fullContent.substring(0, 100)}..."`)

      // Clean up bot name prefix if present
      fullContent = this.removeBotPrefix(fullContent, bot.name)
      console.log(`[BOT MANAGER] Content after prefix removal: "${fullContent.substring(0, 100)}..."`)

      // Update message content
      const messageIndex = messages.findIndex(m => m.id === botMessage.id)
      console.log(`[BOT MANAGER] Updating message at index ${messageIndex} for ${bot.name}`)
      if (messageIndex !== -1 && messages[messageIndex]) {
        console.log(`[BOT MANAGER] Previous content: "${messages[messageIndex].content}"`)
        messages[messageIndex].content = fullContent
        console.log(`[BOT MANAGER] New content: "${fullContent.substring(0, 50)}..."`)
      } else {
        console.error(`[BOT MANAGER] Could not find message to update for ${bot.name}!`)
      }

      // Release streaming slot for next bot
      this.releaseStreamingSlot(streamId)

      // Notify completion
      console.log(`[BOT MANAGER] Broadcasting ai-complete for ${bot.name} (${botMessage.id}): ${fullContent.substring(0, 50)}...`)
      await this.broadcastToAll('ai-complete', {
        messageId: botMessage.id,
        content: fullContent,
        botName: bot.name // Add bot name for debugging
      })

      // Send notification to ntfy.sh (fire and forget)
      sendChatNotification(bot.name, fullContent, 'ai').catch(err =>
        console.error('[BOT MANAGER] Failed to send ntfy notification:', err)
      )

      // Return completed message
      return {
        ...botMessage,
        content: fullContent
      }
    } catch (error) {
      console.error(`[BOT MANAGER] Error generating response for ${bot.name}:`, error)
      // Release streaming slot on error
      this.releaseStreamingSlot(streamId)
      return null
    }
  }

  // Utility: Remove bot name prefix from response
  private removeBotPrefix(content: string, botName: string): string {
    const patterns = [
      new RegExp(`^\\*\\*${botName}:\\*\\* `, 'i'),
      new RegExp(`^\\*\\*${botName}\\*\\*: `, 'i'),
      new RegExp(`^${botName}: `, 'i')
    ]

    for (const pattern of patterns) {
      if (pattern.test(content)) {
        return content.replace(pattern, '')
      }
    }
    return content
  }

  // Utility: Broadcast to all connected clients with error handling
  private async broadcastToAll(event: string, data: ChatMessage | { messageId: string, chunk?: string, content?: string, botName?: string }) {
    // Log critical broadcasts for debugging
    if (event === 'ai-start') {
      const msg = data as ChatMessage
      console.log(`[BROADCAST] ai-start to ${connectedClients.size} clients: ${msg.userName} (${msg.id})`)
    } else if (event === 'ai-complete') {
      const d = data as { messageId: string, botName?: string }
      console.log(`[BROADCAST] ai-complete to ${connectedClients.size} clients: ${d.botName} (${d.messageId})`)
    }

    const broadcastPromises = []
    let successCount = 0
    let failCount = 0

    for (const client of connectedClients) {
      // Only send to clients that have received initial data
      // Check if client has initialDataSent property (from ConnectedClient interface)
      if ('initialDataSent' in client && client.initialDataSent) {
        broadcastPromises.push(
          client.stream.push({
            event,
            data: JSON.stringify(data)
          }).then(() => {
            successCount++
          }).catch((err) => {
            failCount++
            console.error(`[BROADCAST] Failed to send ${event} to ${client.userName}:`, err)
          })
        )
      }
    }

    await Promise.allSettled(broadcastPromises)

    if (failCount > 0) {
      console.warn(`[BROADCAST] ${event}: ${successCount} succeeded, ${failCount} failed`)
    }
  }

  // Utility: Shuffle selections while maintaining priority groups
  private shuffleSelections(selections: BotSelection[]): BotSelection[] {
    // Group by priority
    const groups = new Map<number, BotSelection[]>()
    for (const selection of selections) {
      const group = groups.get(selection.priority) || []
      group.push(selection)
      groups.set(selection.priority, group)
    }

    // Shuffle within each group and combine
    const result: BotSelection[] = []
    const sortedPriorities = Array.from(groups.keys()).sort((a, b) => a - b)

    for (const priority of sortedPriorities) {
      const group = groups.get(priority)!
      result.push(...this.shuffle(group))
    }

    return result
  }

  // Fisher-Yates shuffle
  private shuffle<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const temp = shuffled[i]
      const tempJ = shuffled[j]
      if (temp !== undefined && tempJ !== undefined) {
        shuffled[i] = tempJ
        shuffled[j] = temp
      }
    }
    return shuffled
  }
}

// Singleton instance
export const botManager = new BotResponseManager()
