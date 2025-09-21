import type { ChatMessage } from '../../server/types/chat'

// WebSocket message types
export interface WSMessage<T = unknown> {
  type: string
  data?: T
}

// Authentication
export interface AuthData {
  userId: string
  userName: string
}

export interface ErrorData {
  message: string
}

// Chat-related
export interface TypingData {
  userId: string
  userName?: string
  isTyping: boolean
}

export interface ClearData {
  clearedBy: string
  message?: ChatMessage
}

// Bot-related
export interface BotToggleData {
  botName: string
  enabled: boolean
}

// AI-related
export interface AIStartData {
  id: string
  userId: string
  userName: string
  content?: string
  timestamp: number
  type: 'ai'
}

export interface AIChunkData {
  messageId: string
  chunk: string
}

export interface AICompleteData {
  messageId: string
  content?: string
}

export interface AIErrorData {
  messageId: string
  error: string
}

// User/Presence
export interface UserListItem {
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

// Message type map for type safety
export type MessageTypeMap = {
  'auth': AuthData
  'auth-success': AuthData
  'auth-required': { message: string }
  'error': ErrorData
  'history': ChatMessage[]
  'message': ChatMessage
  'user-list': UserListItem[]
  'typing': TypingData
  'bot-state': Record<string, boolean>
  'bot-toggle': BotToggleData
  'webrtc-signal': import('./webrtc').SignalingMessage
  'clear': ClearData
  'ai-start': AIStartData
  'ai-chunk': AIChunkData
  'ai-complete': AICompleteData
  'ai-error': AIErrorData
  'ping': never
  'pong': never
  'chat': { content: string }
  'media-state': {
    webcam?: boolean
    microphone?: boolean
    screen?: boolean
  }
}
