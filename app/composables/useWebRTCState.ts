interface WebRTCConnectionState {
  roomId: string
  role: 'idle' | 'sharer' | 'viewer'
  isSharing: boolean
  isViewing: boolean
  remoteUserId?: string
  remoteUserName?: string
  connectionState: RTCPeerConnectionState
  iceConnectionState: RTCIceConnectionState
  lastActivity: number
}

interface WebRTCSessionState {
  [sessionId: string]: WebRTCConnectionState
}

export const useWebRTCState = () => {
  // Persistent state that survives refreshes
  const sessions = useState<WebRTCSessionState>('webrtcSessions', () => ({}))
  const currentSessionId = useState<string | null>('currentWebRTCSession', () => null)

  // Create or get a session
  const createSession = (sessionId: string, initialState: Partial<WebRTCConnectionState> = {}): WebRTCConnectionState => {
    const state: WebRTCConnectionState = {
      roomId: '',
      role: 'idle',
      isSharing: false,
      isViewing: false,
      connectionState: 'new',
      iceConnectionState: 'new',
      lastActivity: Date.now(),
      ...initialState
    }

    sessions.value[sessionId] = state
    currentSessionId.value = sessionId

    return state
  }

  // Get current session state
  const getCurrentSession = (): WebRTCConnectionState | null => {
    if (!currentSessionId.value) return null
    return sessions.value[currentSessionId.value] || null
  }

  // Update session state
  const updateSession = (sessionId: string, updates: Partial<WebRTCConnectionState>) => {
    if (sessions.value[sessionId]) {
      sessions.value[sessionId] = {
        ...sessions.value[sessionId],
        ...updates,
        lastActivity: Date.now()
      }
    }
  }

  // Check if we should attempt to reconnect
  const shouldReconnect = (sessionId: string): boolean => {
    const session = sessions.value[sessionId]
    if (!session) return false

    // Don't reconnect if idle or if it's been too long since last activity
    if (session.role === 'idle') return false
    if (Date.now() - session.lastActivity > 300000) return false // 5 minutes

    return session.isSharing || session.isViewing
  }

  // Get reconnection info
  const getReconnectionInfo = (sessionId: string) => {
    const session = sessions.value[sessionId]
    if (!session) return null

    return {
      roomId: session.roomId,
      role: session.role,
      remoteUserId: session.remoteUserId,
      remoteUserName: session.remoteUserName
    }
  }

  // Clear a session
  const clearSession = (sessionId: string) => {
    const newSessions = { ...sessions.value }
    if (sessionId in newSessions) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete newSessions[sessionId]
      sessions.value = newSessions
    }
    if (currentSessionId.value === sessionId) {
      currentSessionId.value = null
    }
  }

  // Clean up old sessions
  const cleanupOldSessions = () => {
    const now = Date.now()
    const maxAge = 3600000 // 1 hour

    Object.keys(sessions.value).forEach((sessionId) => {
      const session = sessions.value[sessionId]
      if (session && now - session.lastActivity > maxAge) {
        const newSessions = { ...sessions.value }
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete newSessions[sessionId]
        sessions.value = newSessions
      }
    })
  }

  // Initialize cleanup interval
  if (import.meta.client) {
    const cleanupInterval = setInterval(cleanupOldSessions, 300000) // 5 minutes

    // Register cleanup
    onUnmounted(() => {
      clearInterval(cleanupInterval)
    })
  }

  return {
    sessions: readonly(sessions),
    currentSessionId: readonly(currentSessionId),
    createSession,
    getCurrentSession,
    updateSession,
    shouldReconnect,
    getReconnectionInfo,
    clearSession,
    cleanupOldSessions
  }
}
