export const useChat = () => {
  const user = useUser()
  const state = useChatState()
  const sse = useChatSSE()
  const actions = useChatActions()

  const initialize = () => {
    user.initUser()

    if (!user.isAuthenticated.value) {
      navigateTo('/')
      return false
    }

    sse.connect()
    return true
  }

  const cleanup = () => {
    sse.disconnect()
    state.clearMessages()
  }

  return {
    ...user,
    ...state,
    ...sse,
    ...actions,
    initialize,
    cleanup
  }
}
