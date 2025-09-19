import { connectedClients, userPresence } from './chat-stream.get'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { userId, userName, isTyping } = body

  if (!userId || !userName || typeof isTyping !== 'boolean') {
    throw createError({
      statusCode: 400,
      statusMessage: 'userId, userName, and isTyping are required'
    })
  }

  const user = userPresence.get(userId)
  if (user) {
    user.isTyping = isTyping
    user.lastActivity = Date.now()
  }

  for (const client of connectedClients) {
    if (client.userId !== userId) {
      await client.stream.push({
        event: 'typing',
        data: JSON.stringify({ userId, userName, isTyping })
      }).catch(() => {})
    }
  }

  return { success: true }
})
