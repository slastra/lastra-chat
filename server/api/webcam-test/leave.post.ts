// Share active rooms from join.post.ts
const activeRooms = global.webcamTestRooms || new Map<string, Set<string>>()
if (!global.webcamTestRooms) {
  global.webcamTestRooms = activeRooms
}

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
      console.log(`[WebcamTest] Room ${roomId} is now empty and removed`)
    } else {
      console.log(`[WebcamTest] ${clientId} left room ${roomId}, ${room.size} participant(s) remaining`)
    }
  }

  return { success: true }
})
