import { ParticipantInfo_State } from 'livekit-server-sdk'
import { getRoomServiceClient } from '../utils/livekit'

interface CleanupRequest {
  roomName: string
  maxIdleMinutes?: number // Maximum minutes a participant can be disconnected before removal
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<CleanupRequest>(event)
    const { roomName, maxIdleMinutes = 1 } = body // Default to 1 minute

    // Validate required fields
    if (!roomName) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required field: roomName'
      })
    }

    // Get shared RoomServiceClient
    const roomService = getRoomServiceClient()

    try {
      // List all participants in the room
      const participants = await roomService.listParticipants(roomName)
      const removedParticipants: string[] = []
      const currentTime = Date.now()
      const maxIdleMs = maxIdleMinutes * 60 * 1000

      for (const participant of participants) {
        // Check if participant is disconnected
        if (participant.state === ParticipantInfo_State.DISCONNECTED) {
          // Check how long they've been disconnected
          const joinedAt = participant.joinedAt ? Number(participant.joinedAt) * 1000 : 0
          const idleTime = currentTime - joinedAt

          console.log(`[Room Cleanup] Checking ${participant.identity}: state=${participant.state}, idle=${idleTime}ms`)

          if (idleTime > maxIdleMs) {
            try {
              // Remove the participant from the room
              await roomService.removeParticipant(roomName, participant.identity)
              removedParticipants.push(participant.identity)
              console.log(`[Room Cleanup] Removed stale participant: ${participant.identity}`)
            } catch (removeError) {
              console.error(`[Room Cleanup] Failed to remove ${participant.identity}:`, removeError)
            }
          }
        }
      }

      return {
        success: true,
        roomName,
        totalParticipants: participants.length,
        removedCount: removedParticipants.length,
        removedParticipants
      }
    } catch (error) {
      // Room might not exist, which is fine
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = String(error.message)
        if (errorMessage.includes('room not found') || errorMessage.includes('not_found')) {
          return {
            success: true,
            roomName,
            totalParticipants: 0,
            removedCount: 0,
            removedParticipants: [],
            message: 'Room does not exist'
          }
        }
      }
      throw error
    }
  } catch (error) {
    console.error('[Room Cleanup] Error:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error // Re-throw HTTP errors
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to cleanup room'
    })
  }
})
