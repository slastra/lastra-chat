import type { SignalingMessage } from '../../shared/types/webrtc'
import type { UserPresence } from './chat-stream.get'

// Use global SSE connections tracking from chat-stream
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const connections = (global as any).sseConnections || new Map<string, { send: (data: { event: string, data: string }) => void }>()

// Access userPresence from global scope (set in chat-stream.get.ts)
declare global {
  var userPresence: Map<string, UserPresence> | undefined
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as SignalingMessage

  if (!body.userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'userId is required'
    })
  }

  console.log(`[Signal] Received ${body.type} signal from ${body.userId}`)

  // Update user media state if this is a media-state signal
  if (body.type === 'media-state' && body.mediaState && global.userPresence) {
    const userPres = global.userPresence.get(body.userId)
    if (userPres) {
      userPres.mediaState = {
        webcam: body.mediaState.webcam ?? userPres.mediaState?.webcam ?? false,
        microphone: body.mediaState.microphone ?? userPres.mediaState?.microphone ?? false,
        screen: body.mediaState.screen ?? userPres.mediaState?.screen ?? false
      }
      console.log(`[Signal] Updated media state for ${body.userId}:`, userPres.mediaState)

      // Broadcast updated user list to all clients (including bots)
      const activeUsers = Array.from(global.userPresence.values())

      // Get bot list from the shared utility
      const { loadBots } = await import('../utils/bots')
      const bots = await loadBots(event)

      const usersWithBots = [
        ...activeUsers,
        ...bots.map(bot => ({
          userId: `ai-${bot.name.toLowerCase()}`,
          userName: bot.name,
          joinedAt: 0,
          isTyping: false,
          lastActivity: Date.now()
        }))
      ]

      for (const [_, conn] of connections.entries()) {
        conn.send({
          event: 'user-list',
          data: JSON.stringify(usersWithBots)
        })
      }
    }
  }

  // Broadcast the signal to the target user or all users
  if (body.targetUserId) {
    // Send to specific user
    const targetConn = connections.get(body.targetUserId)
    if (targetConn) {
      targetConn.send({
        event: 'webrtc-signal',
        data: JSON.stringify(body)
      })
      console.log(`[Signal] Sent ${body.type} signal to ${body.targetUserId}`)
    } else {
      console.warn(`[Signal] Target user ${body.targetUserId} not connected`)
    }
  } else {
    // Broadcast to all users except sender
    for (const [userId, conn] of connections.entries()) {
      if (userId !== body.userId) {
        conn.send({
          event: 'webrtc-signal',
          data: JSON.stringify(body)
        })
      }
    }
    console.log(`[Signal] Broadcasted ${body.type} signal to all users`)
  }

  return { success: true }
})
