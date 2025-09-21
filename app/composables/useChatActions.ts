export const useChatActions = () => {
  const { userName, clientId } = useUser()
  const { addMessage, updateMessage } = useChatState()
  const { playSound } = useSoundManager()
  const toast = useToast()

  let typingTimeout: NodeJS.Timeout | null = null

  const sendMessage = async (content: string) => {
    if (!content.trim() || !userName.value || !clientId.value) {
      return
    }

    const tempId = `temp-${Date.now()}-${Math.random()}`
    const message: ChatMessage = {
      id: tempId,
      userId: clientId.value,
      userName: userName.value,
      content: content.trim(),
      timestamp: Date.now(),
      type: 'user',
      status: 'sending'
    }

    addMessage(message)

    try {
      const response = await $fetch('/api/chat-message', {
        method: 'POST',
        body: {
          userId: clientId.value,
          userName: userName.value,
          content: content.trim()
        }
      })

      updateMessage(tempId, { status: 'sent', id: response.messageId })

      // Play sound when message is sent successfully
      playSound('messageSent')
    } catch (error) {
      console.error('Failed to send message:', error)
      updateMessage(tempId, { status: 'failed' })

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
    if (!userName.value || !clientId.value) {
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
      await $fetch('/api/chat-typing', {
        method: 'POST',
        body: {
          userId: clientId.value,
          userName: userName.value,
          isTyping
        }
      })
    } catch (error) {
      console.error('Failed to send typing indicator:', error)
    }
  }

  return {
    sendMessage,
    sendTypingIndicator
  }
}
