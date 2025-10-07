const STORAGE_KEY_USERNAME = 'lastra-chat-username'

export const useUser = () => {
  // Persistent clientId using cookie (survives browser restart, enables reconnection)
  const clientId = useCookie<string>('lastra-chat-client-id', {
    maxAge: 30 * 24 * 60 * 60, // 30 days
    sameSite: 'lax'
  })

  // Generate clientId if it doesn't exist
  if (!clientId.value && import.meta.client) {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 9)
    clientId.value = `user-${timestamp}-${random}`
  }

  // Load username from localStorage on initialization
  const loadUsername = (): string => {
    if (import.meta.server) return ''

    try {
      const stored = localStorage.getItem(STORAGE_KEY_USERNAME)
      return stored || ''
    } catch (error) {
      console.warn('Failed to load username:', error)
      return ''
    }
  }

  const userName = useState<string>('userName', loadUsername)

  const setUserName = (name: string, remember = true) => {
    userName.value = name

    if (import.meta.client && remember) {
      try {
        localStorage.setItem(STORAGE_KEY_USERNAME, name)
      } catch (error) {
        console.warn('Failed to save username:', error)
      }
    }
  }

  const isAuthenticated = computed(() => !!userName.value)

  const clearUser = () => {
    userName.value = ''

    if (import.meta.client) {
      try {
        localStorage.removeItem(STORAGE_KEY_USERNAME)
      } catch (error) {
        console.warn('Failed to clear username:', error)
      }
    }
  }

  // Check if user has stored preferences
  const hasStoredUsername = computed(() => {
    if (import.meta.server) return false
    try {
      return !!localStorage.getItem(STORAGE_KEY_USERNAME)
    } catch {
      return false
    }
  })

  return {
    userName: readonly(userName),
    clientId: readonly(clientId),
    hasStoredUsername,
    setUserName,
    isAuthenticated,
    clearUser
  }
}
