// Shared chat message type used by components
// Maps to LiveKitChatMessage but with standardized 'type' field
export interface ChatMessage {
  id: string
  userId: string
  userName: string
  content: string
  timestamp: number
  type: 'user' | 'bot' | 'system'
  status?: 'sent' | 'pending' | 'failed'
  metadata?: {
    botName?: string
    isAI?: boolean
  }
}

// Type helper to convert LiveKitChatMessage to ChatMessage
export function convertToLegacyFormat(lkMessage: {
  id: string
  userId: string
  userName: string
  content: string
  timestamp: number
  type: 'message' | 'bot' | 'system' | 'typing'
  metadata?: { botName?: string, isAI?: boolean }
}): ChatMessage {
  return {
    id: lkMessage.id,
    userId: lkMessage.userId,
    userName: lkMessage.userName,
    content: lkMessage.content,
    timestamp: lkMessage.timestamp,
    type: lkMessage.type === 'message'
      ? 'user'
      : lkMessage.type === 'bot'
        ? 'bot'
        : lkMessage.type === 'system'
          ? 'system'
          : 'user',
    status: 'sent',
    metadata: lkMessage.metadata
  }
}
