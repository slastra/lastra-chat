import { botStates, connectedClients } from './chat-stream.get'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { botName, enabled } = body

  if (!botName || enabled === undefined) {
    throw createError({
      statusCode: 400,
      statusMessage: 'botName and enabled are required'
    })
  }

  // Update the global bot state
  botStates.set(botName, enabled)

  console.log(`[BOT TOGGLE] ${botName} set to ${enabled ? 'enabled' : 'disabled'}`)

  // Broadcast the change to all connected clients
  const broadcastPromises = []
  for (const client of connectedClients) {
    // Only send to clients that have received initial data
    if ('initialDataSent' in client && client.initialDataSent) {
      broadcastPromises.push(
        client.stream.push({
          event: 'bot-toggle',
          data: JSON.stringify({ botName, enabled })
        }).catch((err) => {
          console.error(`[BOT TOGGLE] Failed to broadcast to ${client.userName}:`, err)
        })
      )
    }
  }

  await Promise.allSettled(broadcastPromises)

  return {
    success: true,
    botName,
    enabled
  }
})
