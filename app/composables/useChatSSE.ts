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

  let eventSource: EventSource | null = null
  let reconnectTimeout: NodeJS.Timeout | null = null
  let reconnectAttempts = 0
  let hasReceivedInitialData = false
  let isComponentMounted = true
  let lastConnectAttempt = 0
  const MAX_RECONNECT_ATTEMPTS = 10
  const MIN_CONNECT_INTERVAL = 1000 // Prevent rapid reconnection attempts

  // Store event handlers for proper cleanup and reuse
  const eventHandlers = new Map<string, (event: Event | MessageEvent) => void>()

  // Pre-create handlers that don't need to be recreated
  const staticHandlers = {
    ping: () => console.log('[SSE] Received ping'),
    welcome: (event: Event | MessageEvent) => {
      if ('data' in event) {
        try {
          const data = JSON.parse(event.data)
          console.log('[SSE] Welcome received:', data)
        } catch (error) {
          console.error('[SSE] Failed to parse welcome data:', error)
        }
      }
    }
  }

  // Define scheduleReconnect early since it's used by disconnect
  const scheduleReconnect = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
    }

    // Check if we've exceeded max attempts
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[SSE] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`)
      setConnectionStatus('disconnected')
      return
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
    reconnectAttempts++

    console.log(`[SSE] Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)

    reconnectTimeout = setTimeout(() => {
      if (!isComponentMounted) {
        console.log('[SSE] Component unmounted, cancelling reconnection')
        return
      }
      console.log(`[SSE] Attempting to reconnect (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`)
      connect()
    }, delay)
  }

  // Define disconnect function early so it can be used in connect
  const disconnect = (shouldReconnect = true) => {
    console.log('[SSE] Disconnecting...', { shouldReconnect })

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }

    if (eventSource) {
      // Remove all event listeners to prevent memory leaks
      // Important: Remove listeners BEFORE closing the connection
      eventHandlers.forEach((handler, event) => {
        try {
          eventSource!.removeEventListener(event, handler)
        } catch (e) {
          console.warn(`[SSE] Failed to remove handler for ${event}:`, e)
        }
      })

      // Also remove the built-in error handler
      eventSource.onerror = null

      // Close the connection
      eventSource.close()
      eventSource = null
    }

    // Clear handlers after removing them
    eventHandlers.clear()

    hasReceivedInitialData = false
    setConnectionStatus('disconnected')

    if (shouldReconnect && userName.value && clientId.value && isComponentMounted) {
      scheduleReconnect()
    }
  }

  const connect = () => {
    // Debounce rapid connection attempts
    const now = Date.now()
    if (now - lastConnectAttempt < MIN_CONNECT_INTERVAL) {
      console.log('[SSE] Throttling connection attempt')
      setTimeout(() => connect(), MIN_CONNECT_INTERVAL)
      return
    }
    lastConnectAttempt = now

    console.log('[SSE] Attempting to connect...')
    console.log('[SSE] userName:', userName.value)
    console.log('[SSE] clientId:', clientId.value)

    if (!userName.value || !clientId.value) {
      console.error('[SSE] Cannot connect: missing userName or clientId')
      return
    }

    // Clean up any existing connection first
    if (eventSource) {
      console.log('[SSE] Cleaning up existing connection')
      disconnect(false) // Don't trigger reconnect
    }

    // IMPORTANT: Clear all event handlers to prevent duplication
    // This ensures no stale handlers from previous connections remain
    eventHandlers.clear()
    console.log('[SSE] Cleared all event handlers')

    setConnectionStatus('connecting')

    const params = new URLSearchParams({
      userId: clientId.value,
      userName: userName.value
    })

    const url = `/api/chat-stream?${params}`
    console.log('[SSE] Connecting to:', url)

    // EventSource constructor doesn't throw, so no need for try-catch here
    eventSource = new EventSource(url)

    // Create and store event handlers
    const handleOpen = () => {
      console.log('[SSE] Connection opened')
      setConnectionStatus('connected')
      reconnectAttempts = 0 // Reset attempts on successful connection
      hasReceivedInitialData = false

      // Send acknowledgment to server that we're ready
      fetch('/api/chat-ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: clientId.value })
      }).catch(err => console.error('[SSE] Failed to send ready signal:', err))
    }
    eventHandlers.set('open', handleOpen)
    eventSource.addEventListener('open', handleOpen)

    const handleHistory = (event: Event | MessageEvent) => {
      if (!('data' in event)) return
      try {
        const messages = JSON.parse(event.data)
        console.log(`[SSE] Received history with ${messages.length} messages`)
        setMessages(messages)
        hasReceivedInitialData = true
      } catch (error) {
        console.error('[SSE] Failed to parse history data:', error)
      }
    }
    eventHandlers.set('history', handleHistory)
    eventSource.addEventListener('history', handleHistory)

    // Use pre-created static handler for welcome
    eventHandlers.set('welcome', staticHandlers.welcome)
    eventSource.addEventListener('welcome', staticHandlers.welcome)

    const handleMessage = (event: Event | MessageEvent) => {
      if (!('data' in event)) return
      try {
        const message = JSON.parse(event.data)
        console.log(`[SSE] Regular message from ${message.userName}: "${message.content?.substring(0, 30) || 'empty'}..."`)
        // Create a new object to avoid reference issues
        addMessage({
          id: message.id,
          userId: message.userId,
          userName: message.userName,
          content: message.content,
          timestamp: message.timestamp,
          type: message.type || 'user'
        })
      } catch (error) {
        console.error('[SSE] Failed to parse message data:', error)
      }
    }
    eventHandlers.set('message', handleMessage)
    eventSource.addEventListener('message', handleMessage)

    const handleUserList = (event: Event | MessageEvent) => {
      if (!('data' in event)) return
      try {
        const users = JSON.parse(event.data)
        setOnlineUsers(users)
      } catch (error) {
        console.error('[SSE] Failed to parse user list:', error)
      }
    }
    eventHandlers.set('user-list', handleUserList)
    eventSource.addEventListener('user-list', handleUserList)

    const handleTyping = (event: Event | MessageEvent) => {
      if (!('data' in event)) return
      try {
        const { userId, isTyping } = JSON.parse(event.data)
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
    eventHandlers.set('typing', handleTyping)
    eventSource.addEventListener('typing', handleTyping)

    const handleAiStart = (event: Event | MessageEvent) => {
      if (!('data' in event)) return
      try {
        const message = JSON.parse(event.data)
        console.log(`[SSE] ai-start for ${message.userName} with id ${message.id}`)
        // Create a completely new message object to avoid reference issues
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
    eventHandlers.set('ai-start', handleAiStart)
    eventSource.addEventListener('ai-start', handleAiStart)

    const handleAiChunk = (event: Event | MessageEvent) => {
      if (!('data' in event)) return
      try {
        const { messageId, chunk, botName } = JSON.parse(event.data)
        // Debug logging
        if (botName) {
          console.log(`[SSE] Updating ${botName} message ${messageId} with chunk: "${chunk.substring(0, 20)}..."`)
        }

        // Use the updateMessage function which handles the concatenation properly
        // Don't access messages directly here to avoid reference issues
        updateMessage(messageId, {
          chunk, // Pass the chunk, let updateMessage handle concatenation
          status: 'streaming'
        })
      } catch (error) {
        console.error('[SSE] Failed to parse ai-chunk data:', error)
      }
    }
    eventHandlers.set('ai-chunk', handleAiChunk)
    eventSource.addEventListener('ai-chunk', handleAiChunk)

    const handleAiComplete = (event: Event | MessageEvent) => {
      if (!('data' in event)) return
      try {
        const { messageId, content, botName } = JSON.parse(event.data)
        // Debug logging
        if (botName) {
          console.log(`[SSE] Completing ${botName} message ${messageId} with content: "${content?.substring(0, 50) || 'empty'}..."`)
        }

        // Just update the message - the updateMessage function will handle validation
        // and ensure proper isolation
        updateMessage(messageId, {
          content: content || '', // Ensure content is never undefined
          status: 'sent'
        })
      } catch (error) {
        console.error('[SSE] Failed to parse ai-complete data:', error)
      }
    }
    eventHandlers.set('ai-complete', handleAiComplete)
    eventSource.addEventListener('ai-complete', handleAiComplete)

    const handleAiError = (event: Event | MessageEvent) => {
      if (!('data' in event)) return
      try {
        const { messageId, error } = JSON.parse(event.data)
        updateMessage(messageId, { content: error, status: 'failed' })
      } catch (err) {
        console.error('[SSE] Failed to parse ai-error data:', err)
      }
    }
    eventHandlers.set('ai-error', handleAiError)
    eventSource.addEventListener('ai-error', handleAiError)

    // Use pre-created static handler for ping
    eventHandlers.set('ping', staticHandlers.ping)
    eventSource.addEventListener('ping', staticHandlers.ping)

    // Handle clear event
    const handleClear = (event: Event | MessageEvent) => {
      if (!('data' in event)) return
      try {
        const { clearedBy, message } = JSON.parse(event.data)
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
    eventHandlers.set('clear', handleClear)
    eventSource.addEventListener('clear', handleClear)

    // Bot state handlers
    const handleBotState = (event: Event | MessageEvent) => {
      if (!('data' in event)) return
      try {
        const states = JSON.parse(event.data)
        console.log('[SSE] Received bot states:', states)
        setBotStates(states)
      } catch (error) {
        console.error('[SSE] Failed to parse bot state data:', error)
      }
    }
    eventHandlers.set('bot-state', handleBotState)
    eventSource.addEventListener('bot-state', handleBotState)

    const handleBotToggle = (event: Event | MessageEvent) => {
      if (!('data' in event)) return
      try {
        const { botName, enabled } = JSON.parse(event.data)
        console.log(`[SSE] Bot toggle: ${botName} = ${enabled}`)
        updateBotState(botName, enabled)
      } catch (error) {
        console.error('[SSE] Failed to parse bot toggle data:', error)
      }
    }
    eventHandlers.set('bot-toggle', handleBotToggle)
    eventSource.addEventListener('bot-toggle', handleBotToggle)

    const handleError = (error: Event) => {
      console.error('[SSE] Connection error:', error)

      // Check if we have received initial data
      if (!hasReceivedInitialData) {
        console.warn('[SSE] Never received initial data, will retry on reconnect')
      }

      setConnectionStatus('disconnected')

      // Clean up handlers before closing
      eventHandlers.forEach((handler, event) => {
        eventSource?.removeEventListener(event, handler)
      })
      eventHandlers.clear()

      // Close connection
      if (eventSource) {
        eventSource.close()
        eventSource = null
      }

      // Only reconnect if component is still mounted
      if (isComponentMounted) {
        scheduleReconnect()
      }
    }
    eventHandlers.set('error', handleError)
    eventSource.addEventListener('error', handleError)
  }

  onMounted(() => {
    if (userName.value && clientId.value) {
      connect()
    }
  })

  onUnmounted(() => {
    isComponentMounted = false
    disconnect(false) // Don't reconnect when component unmounts
  })

  return {
    connect,
    disconnect,
    isConnected: computed(() => eventSource?.readyState === EventSource.OPEN)
  }
}
