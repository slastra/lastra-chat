import type { StoredSignalMessage } from '../../shared/types/webrtc'

interface SSEConnection {
  send: (data: { event: string, data: string }) => void
}

declare global {
  var screenShareTestRooms: Map<string, Set<string>> | undefined
  var screenShareTestQueues: Map<string, StoredSignalMessage[]> | undefined
  var webcamTestRooms: Map<string, Set<string>> | undefined
  var webcamTestQueues: Map<string, StoredSignalMessage[]> | undefined
  var sseConnections: Map<string, SSEConnection> | undefined
}

export {}
