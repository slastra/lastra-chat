export interface IngressInfo {
  ingressId: string
  streamKey: string
  url: string
  roomName: string
  participantIdentity: string
}

export interface CreateIngressRequest {
  roomName: string
}

export interface CreateIngressResponse {
  ingress: IngressInfo
}
