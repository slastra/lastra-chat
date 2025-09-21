export const useChat = (ws?: ReturnType<typeof useWebSocketChat>) => {
  const user = useUser()
  const state = useChatState()
  const websocket = ws || useWebSocketChat()
  const actions = useChatActions(websocket)

  const initialize = () => {
    user.initUser()

    if (!user.isAuthenticated.value) {
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
