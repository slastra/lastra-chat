import { useEventSource } from '@vueuse/core'

export const useChatSSE = () => {
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
    'bot-toggle': handleBotToggle
  }

  // Initialize useEventSource with auto-reconnection
  const {
    status,
    data: eventData,
    event: eventType,
    error,
    close,
    open
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

  // Watch for incoming events - combine data and event type in a single watcher
  watch([eventData, eventType], ([data, type]) => {
    if (!data || !type) return

    console.log(`[SSE] Event: ${type}`)

    // Call the appropriate handler
    if (eventHandlers[type]) {
      try {
        eventHandlers[type](data)
      } catch (error) {
        console.error(`[SSE] Error handling ${type} event:`, error)
      }
    } else if (type !== 'open') { // 'open' is handled by status watcher
      console.log(`[SSE] Unknown event type: ${type}`)
    }
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

  // Watch for errors
  watch(error, (newError) => {
    if (newError) {
      console.error('[SSE] Connection error:', newError)

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
