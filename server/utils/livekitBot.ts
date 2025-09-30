import { DataPacket_Kind } from 'livekit-server-sdk'
import { getRoomServiceClient } from './livekit'

export async function sendBotMessage(
  roomName: string,
  botName: string,
  content: string
) {
  const client = getRoomServiceClient()

  const message = {
    type: 'bot',
    id: `bot-${Date.now()}-${Math.random()}`,
    userId: `bot-${botName}`,
    userName: botName,
    content,
    timestamp: Date.now(),
    metadata: { botName, isAI: true }
  }

  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(message))

  // Send to all participants in the room
  await client.sendData(roomName, data, DataPacket_Kind.RELIABLE, {})
}
