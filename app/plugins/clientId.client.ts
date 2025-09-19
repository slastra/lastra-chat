export default defineNuxtPlugin(() => {
  const getClientId = () => {
    const storageKey = 'chat-client-id'
    let clientId = sessionStorage.getItem(storageKey)

    if (!clientId) {
      const timestamp = Date.now()
      const random = Math.random().toString(36).substring(2, 9)
      clientId = `user-${timestamp}-${random}`
      sessionStorage.setItem(storageKey, clientId)
    }

    return clientId
  }

  return {
    provide: {
      clientId: getClientId()
    }
  }
})
