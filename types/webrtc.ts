// WebRTC Signaling Message Types

// Use proper WebRTC types from DOM lib
type RTCSessionDescription = RTCSessionDescriptionInit
type RTCIceCandidate = RTCIceCandidateInit

// Screen share specific messages
export interface ScreenShareOfferMessage {
  type: 'screen-share-offer'
  userId: string
  userName: string
  offer: RTCSessionDescription
  targetUserId?: string
}

export interface ScreenShareAnswerMessage {
  type: 'screen-share-answer'
  userId: string
  targetUserId: string
  answer: RTCSessionDescription
}

export interface ScreenShareIceCandidateMessage {
  type: 'screen-share-ice-candidate'
  userId: string
  targetUserId?: string
  candidate: RTCIceCandidate
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
  targetUserId?: string
  [key: string]: unknown // Allow additional properties
}

// Test environment specific messages
export interface TestSignalData {
  offer?: RTCSessionDescription
  answer?: RTCSessionDescription
  candidate?: RTCIceCandidate
  role?: string
  [key: string]: unknown
}

export interface TestSignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'share-start' | 'share-stop'
  roomId: string
  senderId: string
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
