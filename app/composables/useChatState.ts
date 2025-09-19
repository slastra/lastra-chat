export interface ChatMessage {
  id: string
  userId: string
  userName: string
  content: string
  timestamp: number
  type: 'user' | 'system' | 'ai'
  status?: 'sending' | 'sent' | 'failed' | 'streaming'
}

export interface UserPresence {
  userId: string
  userName: string
  joinedAt: number
  isTyping: boolean
  lastActivity: number
}

const MAX_MESSAGE_HISTORY = 256 // Match server limit

export const useChatState = () => {
  // Use a reactive Map for efficient message management
  const messageMap = useState<Map<string, ChatMessage>>('chatMessageMap', () => reactive(new Map()))

  // Computed array for rendering (automatically sorted by timestamp)
  const messages = computed(() => {
    return Array.from(messageMap.value.values())
      .sort((a, b) => a.timestamp - b.timestamp)
  })

  const onlineUsers = useState<UserPresence[]>('onlineUsers', () => [])
  const typingUsers = useState<Set<string>>('typingUsers', () => new Set())
  const connectionStatus = useState<'connecting' | 'connected' | 'disconnected'>('connectionStatus', () => 'connecting')
  const pendingMessages = useState<ChatMessage[]>('pendingMessages', () => [])

  const addMessage = (message: ChatMessage) => {
    // Skip if message already exists
    if (messageMap.value.has(message.id)) {
      console.warn(`[CHAT STATE] Message already exists: ${message.id} from ${message.userName}`)
      // Check if content is different (might be an update)
      const existing = messageMap.value.get(message.id)
      if (existing && existing.content !== message.content) {
        console.log(`[CHAT STATE] Message content differs, updating: ${message.id}`)
        updateMessage(message.id, { content: message.content, status: message.status })
      }
      return
    }

    console.log(`[CHAT STATE] Adding message: ${message.userName} (${message.id}) - "${message.content?.substring(0, 30) || 'empty'}..."`)

    // Create a defensive copy to avoid reference issues
    const messageCopy = {
      id: message.id,
      userId: message.userId,
      userName: message.userName,
      content: message.content || '',
      timestamp: message.timestamp,
      type: message.type,
      status: message.status
    }

    // Add to map (Vue will track this)
    messageMap.value.set(message.id, messageCopy)

    // Clean up old messages if we exceed the limit
    const allIds = Array.from(messageMap.value.keys())
    if (allIds.length > MAX_MESSAGE_HISTORY) {
      // Sort by timestamp and remove oldest
      const sortedMessages = Array.from(messageMap.value.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)

      const toRemove = sortedMessages.slice(0, sortedMessages.length - MAX_MESSAGE_HISTORY)
      toRemove.forEach(([id]) => messageMap.value.delete(id))
    }
  }

  const updateMessage = (messageId: string, updates: Partial<ChatMessage> & { chunk?: string }) => {
    const existing = messageMap.value.get(messageId)

    if (!existing) {
      console.error(`[CHAT STATE] Cannot find message to update: ${messageId}`)
      return
    }

    // Handle chunk updates separately to ensure proper concatenation
    const finalUpdates = { ...updates }
    if ('chunk' in updates) {
      // Concatenate chunk to existing content
      const currentContent = existing.content || ''
      finalUpdates.content = currentContent + (updates.chunk || '')
      delete (finalUpdates as Record<string, unknown>).chunk
      console.log(`[CHAT STATE] Appending chunk to ${existing.userName} message ${messageId}: new length=${finalUpdates.content.length}`)
    } else if (updates.content !== undefined) {
      console.log(`[CHAT STATE] Updating ${existing.userName} message ${messageId}: content="${updates.content?.substring(0, 30) || 'empty'}..."`)
    }

    // Validate we're not mixing up messages
    if (updates.userName && updates.userName !== existing.userName) {
      console.error(`[CHAT STATE] WARNING: Trying to change userName from ${existing.userName} to ${updates.userName}`)
      return
    }

    // Create a completely new message object to avoid any reference issues
    const updatedMessage: ChatMessage = {
      id: existing.id,
      userId: existing.userId,
      userName: existing.userName,
      content: existing.content,
      timestamp: existing.timestamp,
      type: existing.type,
      status: existing.status,
      ...finalUpdates
    }

    // Update the message in the map with a new object
    messageMap.value.set(messageId, updatedMessage)
  }

  const setMessages = (newMessages: ChatMessage[]) => {
    // Clear and rebuild the map
    messageMap.value.clear()

    // Take only the most recent messages
    const messagesToAdd = newMessages.length > MAX_MESSAGE_HISTORY
      ? newMessages.slice(-MAX_MESSAGE_HISTORY)
      : newMessages

    messagesToAdd.forEach((msg) => {
      messageMap.value.set(msg.id, msg)
    })
  }

  const setOnlineUsers = (users: UserPresence[]) => {
    onlineUsers.value = users
  }

  const addTypingUser = (userId: string) => {
    typingUsers.value.add(userId)
  }

  const removeTypingUser = (userId: string) => {
    typingUsers.value.delete(userId)
  }

  const setConnectionStatus = (status: 'connecting' | 'connected' | 'disconnected') => {
    connectionStatus.value = status
  }

  const addPendingMessage = (message: ChatMessage) => {
    pendingMessages.value.push(message)
  }

  const removePendingMessage = (messageId: string) => {
    pendingMessages.value = pendingMessages.value.filter(m => m.id !== messageId)
  }

  const clearMessages = () => {
    messageMap.value.clear()
  }

  return {
    messages,
    onlineUsers,
    typingUsers,
    connectionStatus,
    pendingMessages,
    addMessage,
    updateMessage,
    setMessages,
    setOnlineUsers,
    addTypingUser,
    removeTypingUser,
    setConnectionStatus,
    addPendingMessage,
    removePendingMessage,
    clearMessages
  }
}
