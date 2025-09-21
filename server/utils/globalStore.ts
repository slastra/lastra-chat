import type { StoredSignalMessage } from '../../shared/types/webrtc'

// Type-safe global store access
interface GlobalStore {
  screenShareTestRooms: Map<string, Set<string>>
  screenShareTestQueues: Map<string, StoredSignalMessage[]>
  webcamTestRooms: Map<string, Set<string>>
  webcamTestQueues: Map<string, StoredSignalMessage[]>
}

// Initialize global store with proper typing
const g = global as typeof global & GlobalStore

// Screen share test stores
export const getScreenShareTestRooms = () => {
  if (!g.screenShareTestRooms) {
    g.screenShareTestRooms = new Map<string, Set<string>>()
  }
  return g.screenShareTestRooms
}

export const getScreenShareTestQueues = () => {
  if (!g.screenShareTestQueues) {
    g.screenShareTestQueues = new Map<string, StoredSignalMessage[]>()
  }
  return g.screenShareTestQueues
}

// Webcam test stores
export const getWebcamTestRooms = () => {
  if (!g.webcamTestRooms) {
    g.webcamTestRooms = new Map<string, Set<string>>()
  }
  return g.webcamTestRooms
}

export const getWebcamTestQueues = () => {
  if (!g.webcamTestQueues) {
    g.webcamTestQueues = new Map<string, StoredSignalMessage[]>()
  }
  return g.webcamTestQueues
}
