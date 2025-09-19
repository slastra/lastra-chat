export const useUser = () => {
  const userName = useState<string>('userName', () => '')
  const clientId = useState<string>('clientId', () => '')

  const initUser = () => {
    if (import.meta.client) {
      const storedName = sessionStorage.getItem('userName')
      if (storedName) {
        userName.value = storedName
      }

      const { $clientId } = useNuxtApp()
      clientId.value = $clientId as string
    }
  }

  const setUserName = (name: string) => {
    userName.value = name
    if (import.meta.client) {
      sessionStorage.setItem('userName', name)
    }
  }

  const isAuthenticated = computed(() => !!userName.value)

  const clearUser = () => {
    userName.value = ''
    if (import.meta.client) {
      sessionStorage.removeItem('userName')
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
