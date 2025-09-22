export default defineNuxtRouteMiddleware((_to, _from) => {
  // SPA-only auth check - no server-side concerns
  const { isAuthenticated } = useUser()

  if (!isAuthenticated.value) {
    console.log('[Auth] No username in current session, redirecting to login')
    return navigateTo('/')
  }

  console.log('[Auth] User authenticated in current session')
})
