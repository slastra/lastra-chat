// WebRTC Signaling Message Types

// WebRTC type aliases for better compatibility
export interface RTCSessionDescriptionType {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback'
  sdp?: string
}

export interface RTCIceCandidateType {
  candidate: string
  sdpMLineIndex?: number | null
  sdpMid?: string | null
  usernameFragment?: string | null
}

// Screen share specific messages
export interface ScreenShareOfferMessage {
  type: 'screen-share-offer'
  userId: string
  userName: string
  offer: RTCSessionDescriptionType
  targetUserId?: string
}

export interface ScreenShareAnswerMessage {
  type: 'screen-share-answer'
  userId: string
  targetUserId: string
  answer: RTCSessionDescriptionType
}

export interface ScreenShareIceCandidateMessage {
  type: 'screen-share-ice-candidate'
  userId: string
  targetUserId?: string
  candidate: RTCIceCandidateType
}

export interface ScreenShareStopMessage {
  type: 'screen-share-stop'
  userId: string
  userName: string
}

// Union type for all screen share messages
export type ScreenShareMessage
  = | ScreenShareOfferMessage
    | ScreenShareAnswerMessage
    | ScreenShareIceCandidateMessage
    | ScreenShareStopMessage

// Generic signaling message for any WebRTC connection
export interface SignalingMessage {
  type: string
  userId: string
  userName?: string
  targetUserId?: string
  streamType?: 'webcam' | 'desktop'
  offer?: RTCSessionDescriptionType
  answer?: RTCSessionDescriptionType
  candidate?: RTCIceCandidateType
  mediaState?: {
    webcam?: boolean
    microphone?: boolean
    screen?: boolean
  }
  [key: string]: unknown // Allow additional properties
}

// Test environment specific messages
export interface TestSignalData {
  offer?: RTCSessionDescriptionType
  answer?: RTCSessionDescriptionType
  candidate?: RTCIceCandidateType
  role?: string
  [key: string]: unknown
}

export interface TestSignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'share-start' | 'share-stop' | 'broadcast-start' | 'broadcast-stop'
  roomId: string
  senderId: string
  senderName?: string
  data?: TestSignalData
  timestamp?: number
}

// Server-side message storage
export interface StoredSignalMessage {
  type: string
  roomId: string
  senderId: string
  data: TestSignalData
  timestamp: number
}
