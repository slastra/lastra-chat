export default defineNuxtRouteMiddleware((_to, _from) => {
  // SPA-only auth check - no server-side concerns
  const { isAuthenticated } = useUser()

  if (!isAuthenticated.value) {
    return navigateTo('/')
  }
})
