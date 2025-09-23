import { getWebcamTestRooms } from '../../utils/globalStore'

// Share active rooms across endpoints using global
const activeRooms = getWebcamTestRooms()

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { roomId, clientId } = body

  if (!roomId || !clientId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Room ID and Client ID are required'
    })
  }

  // Initialize room if it doesn't exist
  if (!activeRooms.has(roomId)) {
    activeRooms.set(roomId, new Set())
  }

  // Add client to room
  const room = activeRooms.get(roomId)!
  room.add(clientId)

  return {
    success: true,
    roomId,
    participants: room.size
  }
})
