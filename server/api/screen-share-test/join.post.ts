// Share active rooms across endpoints using global
const activeRooms = global.screenShareTestRooms || new Map<string, Set<string>>()
if (!global.screenShareTestRooms) {
  global.screenShareTestRooms = activeRooms
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { roomId, clientId, role } = body

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

  console.log(`[ScreenShareTest] ${clientId} joined room ${roomId} as ${role}`)
  console.log(`[ScreenShareTest] Room ${roomId} now has ${room.size} participant(s)`)

  return {
    success: true,
    roomId,
    participants: room.size
  }
})
