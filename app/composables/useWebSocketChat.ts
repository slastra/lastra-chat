import { useWebSocket } from '@vueuse/core'
import type { ChatMessage } from '../../server/types/chat'
import type {
  WSMessage,
  AuthData,
  ErrorData,
  TypingData,
  BotToggleData,
  ClearData,
  AIStartData,
  AIChunkData,
  AICompleteData,
  AIErrorData,
  UserListItem
} from '../../shared/types/websocket'

export interface UseWebSocketChatOptions {
  autoConnect?: boolean
  reconnectLimit?: number
  reconnectInterval?: number
  heartbeatInterval?: number
}

export interface UseWebSocketChatReturn {
  // Connection
  status: Ref<'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED'>
  connect: () => void
  disconnect: () => void

  // Messaging
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send: (type: string, data?: any) => void

  // State
  isConnected: ComputedRef<boolean>
  error: Ref<Error | null>
}

// Create a singleton WebSocket instance
let sharedWebSocket: ReturnType<typeof createWebSocketChat> | null = null

const createWebSocketChat = (options: UseWebSocketChatOptions = {}) => {
  const {
    // autoConnect = true, // Reserved for future use
    reconnectLimit = 10,
    reconnectInterval = 1000,
    heartbeatInterval = 30000
  } = options

  const { userName, clientId } = useUser()
  const {
    setMessages,
    addMessage,
    updateMessage,
    setOnlineUsers,
    setConnectionStatus,
    addTypingUser,
    removeTypingUser
  } = useChatState()
  const { setBotStates, updateBotState } = useBots()
  const { playSound } = useSoundManager()

  // Track if we've received initial data
  const hasReceivedInitialData = ref(false)
  type MessageHandler<T = Record<string, unknown>> = (data: T) => void
  const messageHandlers = new Map<string, Set<MessageHandler>>()
  const error = ref<Error | null>(null)

  // Build WebSocket URL
  const wsUrl = computed(() => {
    if (!import.meta.client) return undefined

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = window.location.host
    const url = `${protocol}://${host}/chat`
    return url
  })

  // Initialize WebSocket with auto-reconnection
  const {
    status,
    data,
    send: wsSend,
    open,
    close
  } = useWebSocket(wsUrl, {
    immediate: false, // Don't connect immediately, wait for credentials
    autoReconnect: {
      retries: reconnectLimit,
      delay: reconnectInterval,
      onFailed() {
        console.error('[WS] Max reconnection attempts reached')
        setConnectionStatus('disconnected')
        error.value = new Error('Failed to connect after multiple attempts')
      }
    },
    heartbeat: {
      message: JSON.stringify({ type: 'ping' }),
      interval: heartbeatInterval,
      pongTimeout: heartbeatInterval * 2
    }
  })

  // Handle incoming messages
  watch(data, (newData) => {
    if (!newData) return

    try {
      const msg: WSMessage = typeof newData === 'string'
        ? JSON.parse(newData)
        : newData

      // Handle built-in message types
      switch (msg.type) {
        case 'auth-required':
          handleAuthRequired()
          break

        case 'auth-success':
          handleAuthSuccess(msg.data as AuthData)
          break

        case 'error':
          handleError(msg.data as ErrorData)
          break

        case 'history':
          handleHistory(msg.data as ChatMessage[])
          break

        case 'message':
          handleMessage(msg.data as ChatMessage)
          break

        case 'user-list':
          handleUserList(msg.data as UserListItem[])
          break

        case 'typing':
          handleTyping(msg.data as TypingData)
          break

        case 'bot-state':
          handleBotState(msg.data as Record<string, boolean>)
          break

        case 'bot-toggle':
          handleBotToggle(msg.data as BotToggleData)
          break

        case 'webrtc-signal':
          // WebRTC signals are handled by custom handlers registered via on()
          // Don't process here to avoid duplicates
          break

        case 'clear':
          handleClear(msg.data as ClearData)
          break

        case 'pong':
          break

        case 'ai-start':
          handleAIStart(msg.data as AIStartData)
          break

        case 'ai-chunk':
          handleAIChunk(msg.data as AIChunkData)
          break

        case 'ai-complete':
          handleAIComplete(msg.data as AICompleteData)
          break

        case 'ai-error':
          handleAIError(msg.data as AIErrorData)
          break

        default:
          console.warn(`[WS] Unknown message type: ${msg.type}`)
      }

      // Call custom handlers
      const handlers = messageHandlers.get(msg.type)
      if (handlers) {
        const data = (msg.data || {}) as Record<string, unknown>
        handlers.forEach(handler => handler(data))
      }
    } catch (err) {
      console.error('[WS] Failed to parse message:', err)
      error.value = err as Error
    }
  })

  // Watch connection status
  watch(status, (newStatus) => {
    switch (newStatus) {
      case 'CONNECTING':
        setConnectionStatus('connecting')
        break

      case 'OPEN':
        setConnectionStatus('connected')
        hasReceivedInitialData.value = false
        error.value = null
        // Send authentication immediately
        authenticate()
        break

      case 'CLOSED':
        setConnectionStatus('disconnected')
        break
    }
  })

  // Authentication
  const authenticate = () => {
    if (!userName.value || !clientId.value) {
      console.error('[WS] Cannot authenticate: missing userName or clientId', {
        userName: userName.value,
        clientId: clientId.value
      })
      return
    }

    send('auth', {
      userId: clientId.value,
      userName: userName.value
    })
  }

  // Message handlers
  const handleAuthRequired = () => {
    authenticate()
  }

  const handleAuthSuccess = (_data: AuthData) => {
    // Auth success handled by connection state
  }

  const handleError = (data: ErrorData) => {
    console.error('[WS] Server error:', data)
    error.value = new Error(data.message || 'Unknown server error')
  }

  const handleHistory = (data: ChatMessage[]) => {
    setMessages(data)
    hasReceivedInitialData.value = true
  }

  const handleMessage = (data: ChatMessage) => {
    addMessage(data)

    // Play sound for messages from other users
    if (data.userId !== clientId.value && data.type === 'user') {
      playSound('messageReceived')
    }
  }

  const handleUserList = (data: UserListItem[]) => {
    setOnlineUsers(data.map(u => ({
      userId: u.userId,
      userName: u.userName,
      name: u.userName,
      mediaState: u.mediaState,
      joinedAt: Date.now(),
      isTyping: false,
      lastActivity: Date.now()
    })))

    // Check for user join/leave events
    if (hasReceivedInitialData.value) {
      const { onlineUsers } = useChatState()
      const previousUsers = onlineUsers.value
      const currentUserIds = new Set(data.map(u => u.userId))
      const previousUserIds = new Set(previousUsers.map(u => u.userId))

      // Check for new users
      for (const user of data) {
        if (!previousUserIds.has(user.userId) && user.userId !== clientId.value) {
          playSound('userJoined')
          break
        }
      }

      // Check for users who left
      for (const previousUser of previousUsers) {
        if (!currentUserIds.has(previousUser.userId) && previousUser.userId !== clientId.value) {
          playSound('userLeft')
          break
        }
      }
    }

    setOnlineUsers(data)
  }

  const handleTyping = (data: TypingData) => {
    if (data.userId === clientId.value) return

    if (data.isTyping) {
      addTypingUser(data.userId)
      setTimeout(() => removeTypingUser(data.userId), 3000)
    } else {
      removeTypingUser(data.userId)
    }
  }

  const handleBotState = (data: Record<string, boolean>) => {
    setBotStates(data)
  }

  const handleBotToggle = (data: BotToggleData) => {
    updateBotState(data.botName, data.enabled)
  }

  const handleClear = (data: ClearData) => {
    setMessages([])
    if (data.message) {
      addMessage(data.message)
    }
  }

  const handleAIStart = (data: AIStartData) => {
    const newMessage: ChatMessage = {
      id: data.id,
      userId: data.userId,
      userName: data.userName,
      content: data.content || '',
      timestamp: data.timestamp,
      type: data.type,
      status: 'streaming'
    }
    addMessage(newMessage)
  }

  const handleAIChunk = (data: AIChunkData) => {
    const { messageId, chunk } = data
    updateMessage(messageId, {
      chunk,
      status: 'streaming'
    })
  }

  const handleAIComplete = (data: AICompleteData) => {
    const { messageId, content } = data
    updateMessage(messageId, {
      content: content || '',
      status: 'sent'
    })
    playSound('aiResponse')
  }

  const handleAIError = (data: AIErrorData) => {
    const { messageId, error } = data
    updateMessage(messageId, {
      content: error,
      status: 'failed'
    })
    playSound('error')
  }

  // Public API
  const send = <T = Record<string, unknown>>(type: string, data?: T) => {
    if (status.value !== 'OPEN') {
      console.warn('[WS] Cannot send message: not connected')
      return
    }

    const message: WSMessage = { type }
    if (data !== undefined) {
      message.data = data
    }

    wsSend(JSON.stringify(message))
  }

  const connect = () => {
    open()
  }

  const disconnect = () => {
    close()
    hasReceivedInitialData.value = false
  }

  // Register custom message handler
  const on = (type: string, handler: MessageHandler) => {
    if (!messageHandlers.has(type)) {
      messageHandlers.set(type, new Set())
    }
    const handlers = messageHandlers.get(type)!

    // Check if handler already exists to prevent duplicates
    if (!handlers.has(handler)) {
      handlers.add(handler)
    }
  }

  // Unregister custom message handler
  const off = (type: string, handler: MessageHandler) => {
    const handlers = messageHandlers.get(type)
    if (handlers) {
      handlers.delete(handler)
    }
  }

  // Auto-connect is handled by the consumer (useChat) when appropriate
  // This avoids unnecessary watchers and gives better control

  // Clean up on unmount
  onUnmounted(() => {
    disconnect()
    messageHandlers.clear()
  })

  return {
    // Connection
    status: status as Ref<'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED'>,
    connect,
    disconnect,

    // Messaging
    send,
    on,
    off,

    // State
    isConnected: computed(() => status.value === 'OPEN'),
    error
  }
}

// Export the singleton wrapper
export const useWebSocketChat = (options: UseWebSocketChatOptions = {}) => {
  // Return existing instance if available
  if (sharedWebSocket) {
    return sharedWebSocket
  }

  // Create new instance and store it
  sharedWebSocket = createWebSocketChat(options)
  return sharedWebSocket
}
