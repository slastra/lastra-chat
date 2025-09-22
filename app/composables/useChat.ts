export const useChat = (ws?: ReturnType<typeof useWebSocketChat>) => {
  const user = useUser()
  const state = useChatState()
  const websocket = ws || useWebSocketChat()
  const actions = useChatActions(websocket)

  const initialize = () => {
    // User is now auto-initialized, just check authentication
    if (!user.isAuthenticated.value) {
      console.log('[Chat] User not authenticated during initialize()')
      navigateTo('/')
      return false
    }

    websocket.connect()
    return true
  }

  const cleanup = () => {
    websocket.disconnect()
    state.clearMessages()
  }

  return {
    ...user,
    ...state,
    ...websocket,
    ...actions,
    initialize,
    cleanup
  }
}
