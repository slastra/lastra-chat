import { getWebcamTestRooms } from '../../utils/globalStore'

// Share active rooms from join.post.ts
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

  // Remove client from room
  if (activeRooms.has(roomId)) {
    const room = activeRooms.get(roomId)!
    room.delete(clientId)

    // Clean up empty rooms
    if (room.size === 0) {
      activeRooms.delete(roomId)
    }
  }

  return { success: true }
})
