export const useUser = () => {
  // Initialize userName as empty - no persistence for fresh identity
  const userName = useState<string>('userName', () => '')

  // Generate fresh clientId on every page load
  const clientId = useState<string>('clientId', () => {
    if (!import.meta.client) return ''

    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 9)
    const freshClientId = `user-${timestamp}-${random}`

    console.log('[User] Fresh ClientId generated:', freshClientId)
    return freshClientId
  })

  const setUserName = (name: string) => {
    userName.value = name
    // No persistence - fresh identity on every session
  }

  const isAuthenticated = computed(() => !!userName.value)

  const clearUser = () => {
    userName.value = ''
    // No storage to clear - fresh identity on every session
  }

  // Simple initialization function for cases that need explicit init
  const initUser = () => {
    // Values are already initialized by useState, but we can refresh them
    if (import.meta.client && !userName.value) {
      const storedName = localStorage.getItem('userName') || sessionStorage.getItem('userName')
      if (storedName) {
        userName.value = storedName
      }
    }
  }

  return {
    userName: readonly(userName),
    clientId: readonly(clientId),
    initUser,
    setUserName,
    isAuthenticated,
    clearUser
  }
}
