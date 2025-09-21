// Global type declarations for server-side state management

import type { StoredSignalMessage } from './webrtc'

declare global {
  // Screen share test rooms and message queues
  var screenShareTestRooms: Map<string, Set<string>> | undefined
  var screenShareTestQueues: Map<string, StoredSignalMessage[]> | undefined

  // Webcam test rooms and message queues
  var webcamTestRooms: Map<string, Set<string>> | undefined
  var webcamTestQueues: Map<string, StoredSignalMessage[]> | undefined
}

export {}
