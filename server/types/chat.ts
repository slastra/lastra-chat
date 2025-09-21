export interface ChatMessage {
  id: string
  userId: string
  userName: string
  content: string
  timestamp: number
  type: 'user' | 'system' | 'ai' | 'bot'
  status?: 'sending' | 'sent' | 'failed' | 'streaming'
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
