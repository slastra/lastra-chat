import type { SignalingMessage } from '../../shared/types/webrtc'

export const useChat = (mediaStreamHandler?: (signal: SignalingMessage) => void, checkMediaConnections?: () => void) => {
  const user = useUser()
  const state = useChatState()
  const sse = useChatSSE(mediaStreamHandler, checkMediaConnections)
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
