export const useChatActions = (ws?: ReturnType<typeof useWebSocketChat>) => {
  const { userName, clientId } = useUser()
  const { playSound } = useSoundManager()
  const toast = useToast()

  // If ws is not provided, create a new instance (for backward compatibility)
  const websocket = ws || useWebSocketChat()

  let typingTimeout: NodeJS.Timeout | null = null

  const sendMessage = async (content: string) => {
    if (!content.trim() || !userName.value || !clientId.value) {
      return
    }

    console.log('[ChatActions] WebSocket status:', websocket.status?.value)
    console.log('[ChatActions] WebSocket isConnected:', websocket.isConnected?.value)

    // Check if WebSocket is connected
    if (!websocket.isConnected.value) {
      toast.add({
        title: 'Not connected',
        description: 'Please wait for connection to establish',
        color: 'warning'
      })
      return
    }

    try {
      // Send message via WebSocket
      websocket.send('chat', {
        content: content.trim()
      })

      // Play sound when message is sent successfully
      playSound('messageSent')
    } catch (error) {
      console.error('Failed to send message:', error)

      // Play error sound when message fails to send
      playSound('error')

      toast.add({
        title: 'Failed to send message',
        description: 'Please try again',
        color: 'error'
      })
    }
  }

  const sendTypingIndicator = async (isTyping: boolean) => {
    if (!userName.value || !clientId.value || !websocket.isConnected.value) {
      return
    }

    if (typingTimeout) {
      clearTimeout(typingTimeout)
      typingTimeout = null
    }

    if (isTyping) {
      typingTimeout = setTimeout(() => {
        sendTypingIndicator(false)
      }, 3000)
    }

    try {
      // Send typing indicator via WebSocket
      websocket.send('typing', { isTyping })
    } catch (error) {
      console.error('Failed to send typing indicator:', error)
    }
  }

  const clearChat = async () => {
    if (!websocket.isConnected.value) {
      toast.add({
        title: 'Not connected',
        description: 'Cannot clear chat while disconnected',
        color: 'warning'
      })
      return
    }

    try {
      websocket.send('clear')
      toast.add({
        title: 'Chat cleared',
        description: 'Message history has been cleared',
        color: 'success'
      })
    } catch (error) {
      console.error('Failed to clear chat:', error)
      toast.add({
        title: 'Failed to clear chat',
        description: 'Please try again',
        color: 'error'
      })
    }
  }

  const toggleBot = async (botName: string, enabled: boolean) => {
    if (!websocket.isConnected.value) {
      return
    }

    try {
      websocket.send('bot-toggle', { botName, enabled })
    } catch (error) {
      console.error('Failed to toggle bot:', error)
      toast.add({
        title: 'Failed to toggle bot',
        description: 'Please try again',
        color: 'error'
      })
    }
  }

  return {
    sendMessage,
    sendTypingIndicator,
    clearChat,
    toggleBot
  }
}
