import { RoomEvent } from 'livekit-client'
import type { RemoteParticipant, Room } from 'livekit-client'

export interface LiveKitChatMessage {
  type: 'message' | 'bot' | 'system' | 'typing'
  id: string
  userId: string
  userName: string
  content: string
  timestamp: number
  metadata?: {
    botName?: string
    isAI?: boolean
  }
}

export interface UseLiveKitChatOptions {
  room: Ref<Room | null>
  userId: string
  userName: string
  maxHistorySize?: number
}

export interface UseLiveKitChatReturn {
  // Chat state
  messages: ComputedRef<LiveKitChatMessage[]>
  isTyping: Ref<boolean>
  typingUsers: ComputedRef<string[]>
  messageHistory: Ref<LiveKitChatMessage[]>

  // Methods
  sendMessage: (content: string, type?: 'message' | 'bot' | 'system') => Promise<void>
  sendTypingIndicator: (isTyping: boolean) => void
  clearHistory: () => void
  addLocalSystemMessage: (content: string) => void

  // Bot integration
  sendBotMessage: (content: string, botName: string) => Promise<void>

  // Events
  on: (event: string, handler: (...args: unknown[]) => void) => void
  off: (event: string, handler: (...args: unknown[]) => void) => void
}

export function useLiveKitChat(options: UseLiveKitChatOptions): UseLiveKitChatReturn {
  const { room, userId, userName, maxHistorySize = 1000 } = options

  // Chat state
  const messageHistory = ref<LiveKitChatMessage[]>([])
  const isTyping = ref(false)
  const typingUsersMap = ref<Map<string, { userName: string, timestamp: number }>>(new Map())

  // Event handlers
  const eventHandlers = new Map<string, Set<(...args: unknown[]) => void>>()

  // Computed properties
  const messages = computed(() =>
    messageHistory.value.filter(msg => msg.type !== 'typing')
  )

  const typingUsers = computed(() => {
    const now = Date.now()
    const activeTyping: string[] = []

    // Remove expired typing indicators (older than 3 seconds)
    typingUsersMap.value.forEach((data, userId) => {
      if (now - data.timestamp > 3000) {
        typingUsersMap.value.delete(userId)
      } else {
        activeTyping.push(data.userName)
      }
    })

    return activeTyping
  })

  // Message encoding/decoding
  function encodeMessage(message: LiveKitChatMessage): Uint8Array {
    const jsonString = JSON.stringify(message)
    return new TextEncoder().encode(jsonString)
  }

  function decodeMessage(data: Uint8Array): LiveKitChatMessage | null {
    try {
      const jsonString = new TextDecoder().decode(data)
      return JSON.parse(jsonString) as LiveKitChatMessage
    } catch (error) {
      console.error('[LiveKit Chat] Failed to decode message:', error)
      return null
    }
  }

  // Generate unique message ID
  function generateMessageId(): string {
    return `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  // Add message to history
  function addMessageToHistory(message: LiveKitChatMessage) {
    messageHistory.value.push(message)

    // Limit history size
    if (messageHistory.value.length > maxHistorySize) {
      messageHistory.value = messageHistory.value.slice(-maxHistorySize)
    }

    emitEvent('messageReceived', message)
  }

  // Handle incoming data
  function handleDataReceived(data: Uint8Array, _participant?: RemoteParticipant) {
    const message = decodeMessage(data)
    if (!message) return

    // Handle typing indicators
    if (message.type === 'typing') {
      if (message.userId !== userId) { // Don't show our own typing
        if (message.content === 'start') {
          typingUsersMap.value.set(message.userId, {
            userName: message.userName,
            timestamp: Date.now()
          })
        } else if (message.content === 'stop') {
          typingUsersMap.value.delete(message.userId)
        }
      }
      return
    }

    // Skip if we already have this message (by ID) to prevent duplicates
    if (messageHistory.value.some(m => m.id === message.id)) {
      return
    }

    // Add regular messages to history
    addMessageToHistory(message)

    // Play sound for incoming messages (not for own messages or system messages)
    if (message.userId !== userId && message.type !== 'system') {
      const { playSound } = useSoundManager()
      // Play aiResponse sound for bot messages, messageReceived sound for user messages
      if (message.type === 'bot') {
        playSound('aiResponse')
      } else {
        playSound('messageReceived')
      }
    }

    // Emit specific events based on message type
    if (message.type === 'bot') {
      emitEvent('botMessage', message)
    } else if (message.type === 'system') {
      emitEvent('systemMessage', message)
    } else {
      emitEvent('userMessage', message)
    }
  }

  // Event management
  function emitEvent(event: string, ...args: unknown[]) {
    const handlers = eventHandlers.get(event)
    if (handlers) {
      handlers.forEach(handler => handler(...args))
    }
  }

  function on(event: string, handler: (...args: unknown[]) => void) {
    if (!eventHandlers.has(event)) {
      eventHandlers.set(event, new Set())
    }
    eventHandlers.get(event)!.add(handler)
  }

  function off(event: string, handler: (...args: unknown[]) => void) {
    const handlers = eventHandlers.get(event)
    if (handlers) {
      handlers.delete(handler)
    }
  }

  // Public methods
  async function sendMessage(content: string, type: 'message' | 'bot' | 'system' = 'message'): Promise<void> {
    if (!room.value) {
      throw new Error('Room not connected')
    }

    const message: LiveKitChatMessage = {
      type,
      id: generateMessageId(),
      userId,
      userName,
      content,
      timestamp: Date.now()
    }

    // Add to local history immediately (sender doesn't receive their own data messages)
    addMessageToHistory(message)

    // Send notification for user messages (not bot or system messages)
    if (type === 'message') {
      // Fire and forget - don't wait for notification to complete
      $fetch('/api/notify', {
        method: 'POST',
        body: {
          userName,
          message: content
        }
      }).catch(() => {
        // Silently ignore notification errors
      })
    }

    // Send via reliable data channel
    const encodedMessage = encodeMessage(message)
    await room.value.localParticipant.publishData(encodedMessage, {
      reliable: true,
      destinationIdentities: [] // Send to all participants
    })

    // Stop typing indicator when sending message
    if (isTyping.value) {
      sendTypingIndicator(false)
    }
  }

  async function sendBotMessage(content: string, botName: string): Promise<void> {
    if (!room.value) {
      throw new Error('Room not connected')
    }

    const message: LiveKitChatMessage = {
      type: 'bot',
      id: generateMessageId(),
      userId: `bot-${botName}`,
      userName: botName,
      content,
      timestamp: Date.now(),
      metadata: {
        botName,
        isAI: true
      }
    }

    // Add to local history immediately (sender doesn't receive their own data messages)
    addMessageToHistory(message)

    // Send via reliable data channel
    const encodedMessage = encodeMessage(message)
    await room.value.localParticipant.publishData(encodedMessage, {
      reliable: true,
      destinationIdentities: []
    })
  }

  function sendTypingIndicator(typing: boolean): void {
    if (!room.value) return

    isTyping.value = typing

    const typingMessage: LiveKitChatMessage = {
      type: 'typing',
      id: generateMessageId(),
      userId,
      userName,
      content: typing ? 'start' : 'stop',
      timestamp: Date.now()
    }

    // Send via unreliable data channel for typing indicators
    const encodedMessage = encodeMessage(typingMessage)
    room.value.localParticipant.publishData(encodedMessage, {
      reliable: false,
      destinationIdentities: []
    }).catch((error) => {
      console.warn('[LiveKit Chat] Failed to send typing indicator:', error)
    })
  }

  function clearHistory(): void {
    messageHistory.value = []
    typingUsersMap.value.clear()
    emitEvent('historyCleared')
  }

  function addLocalSystemMessage(content: string): void {
    const message: LiveKitChatMessage = {
      type: 'system',
      id: generateMessageId(),
      userId: 'system',
      userName: 'System',
      content,
      timestamp: Date.now()
    }

    // Only add to local history, DON'T publish to room
    addMessageToHistory(message)
  }

  // Set up room event listeners
  function setupRoomListeners() {
    if (!room.value) return

    // Listen for data messages
    room.value.on(RoomEvent.DataReceived, (data: Uint8Array, participant?: RemoteParticipant) => {
      handleDataReceived(data, participant)
    })

    // Clean up typing indicators when participants leave
    room.value.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      typingUsersMap.value.delete(participant.identity)
    })
  }

  // Watch for room changes
  watch(room, (newRoom, oldRoom) => {
    // Remove old listeners if they exist
    if (oldRoom) {
      oldRoom.off(RoomEvent.DataReceived, handleDataReceived)
    }

    // Set up new listeners
    if (newRoom) {
      setupRoomListeners()
    }
  }, { immediate: true })

  // Cleanup typing indicators on unmount
  onUnmounted(() => {
    if (isTyping.value) {
      sendTypingIndicator(false)
    }
  })

  return {
    // Chat state
    messages,
    isTyping: readonly(isTyping),
    typingUsers,
    messageHistory,

    // Methods
    sendMessage,
    sendTypingIndicator,
    clearHistory,
    addLocalSystemMessage,

    // Bot integration
    sendBotMessage,

    // Events
    on,
    off
  }
}
