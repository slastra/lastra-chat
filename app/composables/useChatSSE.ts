import { useEventSource } from '@vueuse/core'
import type { SignalingMessage } from '../../shared/types/webrtc'

export const useChatSSE = (mediaStreamHandler?: (signal: SignalingMessage) => void, checkMediaConnections?: () => void) => {
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

  // Track initial data state
  const hasReceivedInitialData = ref(false)

  // Build the SSE URL with query parameters
  const sseUrl = computed(() => {
    if (!userName.value || !clientId.value) {
      return undefined
    }
    const params = new URLSearchParams({
      userId: clientId.value,
      userName: userName.value
    })
    return `/api/chat-stream?${params}`
  })

  // Event handlers
  const handleHistory = (data: string) => {
    try {
      const messages = JSON.parse(data)
      console.log(`[SSE] Received history with ${messages.length} messages`)
      setMessages(messages)
      hasReceivedInitialData.value = true
    } catch (error) {
      console.error('[SSE] Failed to parse history data:', error)
    }
  }

  const handleMessage = (data: string) => {
    try {
      const message = JSON.parse(data)
      console.log(`[SSE] Regular message from ${message.userName}: "${message.content?.substring(0, 30) || 'empty'}..."`)

      addMessage({
        id: message.id,
        userId: message.userId,
        userName: message.userName,
        content: message.content,
        timestamp: message.timestamp,
        type: message.type || 'user'
      })

      // Play sound for messages from other users
      if (message.userId !== clientId.value) {
        playSound('messageReceived')
      }
    } catch (error) {
      console.error('[SSE] Failed to parse message data:', error)
    }
  }

  const handleUserList = (data: string) => {
    try {
      const users = JSON.parse(data)
      console.log('[SSE] Received user list update:', users.map((u: { userName: string, mediaState?: { webcam: boolean, microphone: boolean, screen: boolean } }) => ({
        name: u.userName,
        mediaState: u.mediaState
      })))

      // Check for user join/leave events
      if (hasReceivedInitialData.value) {
        const { onlineUsers } = useChatState()
        const previousUsers = onlineUsers.value
        const currentUserIds = new Set(users.map((u: { userId: string }) => u.userId))
        const previousUserIds = new Set(previousUsers.map(u => u.userId))

        // Check for new users
        for (const user of users) {
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

      setOnlineUsers(users)

      // After updating users, check if we need to connect to any media streams
      if (checkMediaConnections) {
        setTimeout(() => {
          console.log('[SSE] Checking for media connections after user list update')
          checkMediaConnections()
        }, 100) // Small delay to ensure state is updated
      }
    } catch (error) {
      console.error('[SSE] Failed to parse user list:', error)
    }
  }

  const handleTyping = (data: string) => {
    try {
      const { userId, isTyping } = JSON.parse(data)
      if (isTyping) {
        addTypingUser(userId)
        setTimeout(() => removeTypingUser(userId), 3000)
      } else {
        removeTypingUser(userId)
      }
    } catch (error) {
      console.error('[SSE] Failed to parse typing data:', error)
    }
  }

  const handleAiStart = (data: string) => {
    try {
      const message = JSON.parse(data)
      console.log(`[SSE] ai-start for ${message.userName} with id ${message.id}`)

      const newMessage: ChatMessage = {
        id: message.id,
        userId: message.userId,
        userName: message.userName,
        content: message.content || '',
        timestamp: message.timestamp,
        type: message.type,
        status: 'streaming' as const
      }
      addMessage(newMessage)
    } catch (error) {
      console.error('[SSE] Failed to parse ai-start data:', error)
    }
  }

  const handleAiChunk = (data: string) => {
    try {
      const { messageId, chunk, botName } = JSON.parse(data)

      if (botName) {
        console.log(`[SSE] Updating ${botName} message ${messageId} with chunk: "${chunk.substring(0, 20)}..."`)
      }

      updateMessage(messageId, {
        chunk,
        status: 'streaming'
      })
    } catch (error) {
      console.error('[SSE] Failed to parse ai-chunk data:', error)
    }
  }

  const handleAiComplete = (data: string) => {
    try {
      const { messageId, content, botName } = JSON.parse(data)

      if (botName) {
        console.log(`[SSE] Completing ${botName} message ${messageId} with content: "${content?.substring(0, 50) || 'empty'}..."`)
      }

      updateMessage(messageId, {
        content: content || '',
        status: 'sent'
      })

      // Play AI response sound
      playSound('aiResponse')
    } catch (error) {
      console.error('[SSE] Failed to parse ai-complete data:', error)
    }
  }

  const handleAiError = (data: string) => {
    try {
      const { messageId, error: errorMsg } = JSON.parse(data)
      updateMessage(messageId, {
        content: errorMsg,
        status: 'failed'
      })

      // Play error sound
      playSound('error')
    } catch (err) {
      console.error('[SSE] Failed to parse ai-error data:', err)
    }
  }

  const handleClear = (data: string) => {
    try {
      const { clearedBy, message } = JSON.parse(data)
      console.log(`[SSE] Chat cleared by ${clearedBy}`)

      // Clear all messages
      setMessages([])

      // Add the system message about the clear
      if (message) {
        addMessage(message)
      }
    } catch (error) {
      console.error('[SSE] Failed to parse clear data:', error)
    }
  }

  const handleBotState = (data: string) => {
    try {
      const states = JSON.parse(data)
      console.log('[SSE] Received bot states:', states)
      setBotStates(states)
    } catch (error) {
      console.error('[SSE] Failed to parse bot state data:', error)
    }
  }

  const handleBotToggle = (data: string) => {
    try {
      const { botName, enabled } = JSON.parse(data)
      console.log(`[SSE] Bot toggle: ${botName} = ${enabled}`)
      updateBotState(botName, enabled)
    } catch (error) {
      console.error('[SSE] Failed to parse bot toggle data:', error)
    }
  }

  const handleWebRTCSignal = (data: string) => {
    try {
      const signal = JSON.parse(data) as SignalingMessage
      console.log(`[SSE] WebRTC signal: ${signal.type} from ${signal.userId}/${signal.userName}`)

      if (signal.type === 'media-state') {
        console.log(`[SSE] Media state update:`, signal.mediaState)
      }

      // Use the passed in handler if available
      if (mediaStreamHandler) {
        mediaStreamHandler(signal)
      } else {
        console.warn('[SSE] No media stream handler provided for WebRTC signal')
      }
    } catch (error) {
      console.error('[SSE] Failed to parse WebRTC signal data:', error)
    }
  }

  // Create event handlers map
  const eventHandlers: Record<string, (data: string) => void> = {
    'history': handleHistory,
    'welcome': data => console.log('[SSE] Welcome received:', data),
    'message': handleMessage,
    'user-list': handleUserList,
    'typing': handleTyping,
    'ai-start': handleAiStart,
    'ai-chunk': handleAiChunk,
    'ai-complete': handleAiComplete,
    'ai-error': handleAiError,
    'ping': () => console.log('[SSE] Received ping'),
    'clear': handleClear,
    'bot-state': handleBotState,
    'bot-toggle': handleBotToggle,
    'webrtc-signal': handleWebRTCSignal
  }

  // Initialize useEventSource with auto-reconnection
  const {
    status,
    error,
    close,
    open,
    eventSource
  } = useEventSource(sseUrl, Object.keys(eventHandlers), {
    immediate: false, // Don't connect immediately, wait for explicit connect()
    autoReconnect: {
      retries: 10,
      delay: 1000,
      onFailed() {
        console.error('[SSE] Max reconnection attempts reached. Giving up.')
        setConnectionStatus('disconnected')
      }
    }
  })

  // Store event listener functions for cleanup
  const eventListeners = new Map<string, (event: MessageEvent) => void>()

  // Add event listeners directly to EventSource when available
  watchEffect((onCleanup) => {
    const es = eventSource.value
    if (!es) return

    // Create and store event listeners
    Object.entries(eventHandlers).forEach(([eventName, handler]) => {
      const listener = (event: MessageEvent) => {
        console.log(`[SSE] Event: ${eventName}`)
        try {
          handler(event.data)
        } catch (error) {
          console.error(`[SSE] Error handling ${eventName} event:`, error)
        }
      }

      es.addEventListener(eventName, listener)
      eventListeners.set(eventName, listener)
    })

    // Cleanup function to remove all listeners
    onCleanup(() => {
      eventListeners.forEach((listener, eventName) => {
        es.removeEventListener(eventName, listener)
      })
      eventListeners.clear()
    })
  })

  // Watch connection status changes
  watch(status, (newStatus) => {
    switch (newStatus) {
      case 'CONNECTING':
        setConnectionStatus('connecting')
        console.log('[SSE] Connecting...')
        break
      case 'OPEN':
        setConnectionStatus('connected')
        console.log('[SSE] Connected')
        hasReceivedInitialData.value = false

        // Send ready signal
        fetch('/api/chat-ready', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: clientId.value })
        }).catch(err => console.error('[SSE] Failed to send ready signal:', err))
        break
      case 'CLOSED':
        setConnectionStatus('disconnected')
        console.log('[SSE] Disconnected')
        break
    }
  })

  // Use watchEffect for error handling
  watchEffect(() => {
    if (error.value) {
      console.error('[SSE] Connection error:', error.value)

      if (!hasReceivedInitialData.value) {
        console.warn('[SSE] Never received initial data, will retry on reconnect')
      }
    }
  })

  // Connection management functions
  const connect = () => {
    console.log('[SSE] Attempting to connect...')
    console.log('[SSE] userName:', userName.value)
    console.log('[SSE] clientId:', clientId.value)

    if (!userName.value || !clientId.value) {
      console.error('[SSE] Cannot connect: missing userName or clientId')
      return
    }

    open() // Open the EventSource connection
  }

  const disconnect = () => {
    console.log('[SSE] Disconnecting...')
    close() // Close the EventSource connection
    hasReceivedInitialData.value = false
  }

  // Auto-connect when component is mounted and credentials are available
  onMounted(() => {
    if (userName.value && clientId.value) {
      connect()
    }
  })

  // Clean up on unmount
  onUnmounted(() => {
    disconnect()
  })

  return {
    connect,
    disconnect,
    isConnected: computed(() => status.value === 'OPEN')
  }
}
