import { connectedClients } from './chat-stream.get'

// Handle client ready signal to avoid race conditions
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { userId } = body

  if (!userId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'userId is required'
    })
  }

  // Find the client and mark as ready
  const client = Array.from(connectedClients).find(c => c.userId === userId)

  if (client) {
    // Send any queued initial data now that client is ready
    console.log(`[SSE] Client ${userId} signaled ready`)

    // Trigger initial data send if needed
    if (client.stream) {
      // The stream handler will now know the client is ready
      return { success: true, status: 'ready' }
    }
  }

  return { success: false, status: 'client_not_found' }
})
