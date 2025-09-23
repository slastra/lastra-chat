import type { UseLiveKitChatReturn } from './useLiveKitChat'
import type { UseLiveKitRoomReturn } from './useLiveKitRoom'

// Types for LiveKit bridge compatibility
export interface ChatMessage {
  id: string
  userId: string
  userName: string
  content: string
  timestamp: number
  type: 'user' | 'bot' | 'system'
  status: 'sent' | 'pending' | 'failed'
  metadata?: {
    botName?: string
    isAI?: boolean
  }
}

export interface UserPresence {
  userId: string
  userName: string
  joinedAt: number
  isTyping: boolean
  lastActivity: number
  mediaState?: {
    webcam: boolean
    microphone: boolean
    screen: boolean
  }
}

// Bridge composable that provides legacy chat interface using LiveKit
export function useLiveKitChatState(
  liveKitChat: UseLiveKitChatReturn,
  liveKitRoom: UseLiveKitRoomReturn
) {
  // Convert LiveKit messages to legacy ChatMessage format
  const messages = computed(() => {
    return liveKitChat.messages.value.map(lkMessage => ({
      id: lkMessage.id,
      userId: lkMessage.userId,
      userName: lkMessage.userName,
      content: lkMessage.content,
      timestamp: lkMessage.timestamp,
      type: lkMessage.type === 'message'
        ? 'user' as const
        : lkMessage.type === 'bot'
          ? 'bot' as const
          : lkMessage.type === 'system'
            ? 'system' as const
            : 'user' as const,
      status: 'sent' as const
    }))
  })

  // Convert LiveKit participants to legacy UserPresence format
  const onlineUsers = computed(() => {
    const users = []

    // Add local participant
    if (liveKitRoom.localParticipant.value) {
      const participant = liveKitRoom.localParticipant.value
      users.push({
        userId: participant.identity,
        userName: participant.name || participant.identity,
        joinedAt: Date.now(), // We don't have this info from LiveKit
        isTyping: false, // Will be updated by typing users
        lastActivity: Date.now(),
        mediaState: {
          webcam: participant.isCameraEnabled,
          microphone: participant.isMicrophoneEnabled,
          screen: participant.isScreenShareEnabled
        }
      })
    }

    // Add remote participants
    liveKitRoom.remoteParticipants.value.forEach((participant) => {
      users.push({
        userId: participant.identity,
        userName: participant.name || participant.identity,
        joinedAt: Date.now(), // We don't have this info from LiveKit
        isTyping: false, // Will be updated by typing users
        lastActivity: Date.now(),
        mediaState: {
          webcam: participant.isCameraEnabled,
          microphone: participant.isMicrophoneEnabled,
          screen: participant.isScreenShareEnabled
        }
      })
    })

    return users
  })

  // Convert LiveKit typing users to legacy format
  const typingUsers = computed(() => {
    return new Set(liveKitChat.typingUsers.value)
  })

  // Map LiveKit connection state to legacy format
  const connectionStatus = computed(() => {
    if (liveKitRoom.isConnected.value) return 'connected'
    if (liveKitRoom.isConnecting.value) return 'connecting'
    return 'disconnected'
  })

  // Legacy state management (not used with LiveKit but needed for compatibility)
  const pendingMessages = ref([])
  const userMediaStreams = ref(new Map())

  // Legacy methods mapped to LiveKit
  const addMessage = (_message: unknown) => {
    // LiveKit handles message adding automatically
    console.warn('[ChatState] addMessage called on LiveKit bridge - messages are handled automatically')
  }

  const updateMessage = (_messageId: string, _updates: unknown) => {
    // LiveKit handles message updates differently
    console.warn('[ChatState] updateMessage called on LiveKit bridge - not supported')
  }

  const setMessages = (_newMessages: unknown[]) => {
    // LiveKit handles message history automatically
    console.warn('[ChatState] setMessages called on LiveKit bridge - messages are handled automatically')
  }

  const setOnlineUsers = (_users: unknown[]) => {
    // LiveKit handles participant list automatically
    console.warn('[ChatState] setOnlineUsers called on LiveKit bridge - participants are handled automatically')
  }

  const addTypingUser = (_userId: string) => {
    // Typing is handled by LiveKit data channels
    console.warn('[ChatState] addTypingUser called on LiveKit bridge - typing is handled automatically')
  }

  const removeTypingUser = (_userId: string) => {
    // Typing is handled by LiveKit data channels
    console.warn('[ChatState] removeTypingUser called on LiveKit bridge - typing is handled automatically')
  }

  const setConnectionStatus = (_status: string) => {
    // Connection status is derived from LiveKit room state
    console.warn('[ChatState] setConnectionStatus called on LiveKit bridge - status is derived from room state')
  }

  const addPendingMessage = (_message: unknown) => {
    // LiveKit handles pending messages differently
    console.warn('[ChatState] addPendingMessage called on LiveKit bridge - not used')
  }

  const removePendingMessage = (_messageId: string) => {
    // LiveKit handles pending messages differently
    console.warn('[ChatState] removePendingMessage called on LiveKit bridge - not used')
  }

  const clearMessages = () => {
    liveKitChat.clearHistory()
  }

  // Media stream management is now handled by LiveKit tracks
  const addUserStream = (_userId: string, _stream: MediaStream, _type: string) => {
    console.warn('[ChatState] addUserStream called on LiveKit bridge - media is handled by tracks')
  }

  const removeUserStream = (_userId: string, _type?: string) => {
    console.warn('[ChatState] removeUserStream called on LiveKit bridge - media is handled by tracks')
  }

  const updateUserStream = (_userId: string, _stream: MediaStream, _type: string) => {
    console.warn('[ChatState] updateUserStream called on LiveKit bridge - media is handled by tracks')
  }

  const getUserStreams = (_userId: string) => {
    // Return empty array since media is now handled by LiveKit tracks
    return []
  }

  const updateUserMediaState = (_userId: string, _mediaState: unknown) => {
    console.warn('[ChatState] updateUserMediaState called on LiveKit bridge - media state is derived from tracks')
  }

  return {
    // Computed state
    messages,
    onlineUsers,
    typingUsers,
    connectionStatus,
    pendingMessages,
    userMediaStreams,

    // Legacy methods (mostly no-ops since LiveKit handles everything)
    addMessage,
    updateMessage,
    setMessages,
    setOnlineUsers,
    addTypingUser,
    removeTypingUser,
    setConnectionStatus,
    addPendingMessage,
    removePendingMessage,
    clearMessages,
    addUserStream,
    removeUserStream,
    updateUserStream,
    getUserStreams,
    updateUserMediaState
  }
}
