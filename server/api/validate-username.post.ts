import { ParticipantInfo_State } from 'livekit-server-sdk'
import { getRoomServiceClient } from '../utils/livekit'

interface ValidateUsernameRequest {
  roomName: string
  username: string
  clientId?: string // Optional: for allowing reconnection with same name
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<ValidateUsernameRequest>(event)
    const { roomName, username, clientId } = body

    // Validate required fields
    if (!roomName || !username) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing required fields: roomName and username'
      })
    }

    // Sanitize and validate username
    const trimmedUsername = username.trim()
    if (trimmedUsername.length < 1 || trimmedUsername.length > 50) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Username must be between 1 and 50 characters'
      })
    }

    // Get shared RoomServiceClient
    const roomService = getRoomServiceClient()

    try {
      // List all participants in the room
      const participants = await roomService.listParticipants(roomName)

      console.log('[Username Validation] Room participants:', participants.map(p => ({
        name: p.name,
        identity: p.identity,
        state: p.state,
        joinedAt: p.joinedAt,
        metadata: p.metadata
      })))
      console.log('[Username Validation] Checking username:', trimmedUsername, 'clientId:', clientId)

      // Check if username is already taken (case-insensitive)
      // Note: In LiveKit, 'identity' is the unique identifier, which we set to the username
      const lowerUsername = trimmedUsername.toLowerCase()
      const nameExists = participants.some((participant) => {
        // Skip disconnected participants (they'll be removed by LiveKit after timeout)
        if (participant.state === ParticipantInfo_State.DISCONNECTED) {
          console.log('[Username Validation] Skipping disconnected participant:', participant.identity)
          return false
        }

        // Check participant identity (which we set to the username)
        const participantIdentity = participant.identity?.toLowerCase()
        console.log('[Username Validation] Comparing identity:', participantIdentity, 'vs', lowerUsername, 'state:', participant.state)
        if (participantIdentity === lowerUsername) {
          // If clientId provided, check if it's the same user reconnecting
          if (clientId && participant.metadata) {
            try {
              const metadata = JSON.parse(participant.metadata)
              console.log('[Username Validation] Metadata check:', metadata.userId, 'vs', clientId)
              if (metadata.userId === clientId) {
                return false // Allow same user to reconnect with same name
              }
            } catch {
              // Invalid metadata, treat as different user
            }
          }
          return true // Name is taken by another user
        }
        return false
      })

      if (nameExists) {
        // Generate suggestions for alternative usernames
        const suggestions = []
        for (let i = 1; i <= 5; i++) {
          const suggestion = `${trimmedUsername}${i}`
          const suggestionExists = participants.some(p =>
            p.identity?.toLowerCase() === suggestion.toLowerCase()
          )
          if (!suggestionExists) {
            suggestions.push(suggestion)
            if (suggestions.length >= 3) break
          }
        }

        return {
          valid: false,
          message: 'Username is already taken',
          suggestions
        }
      }

      return {
        valid: true,
        message: 'Username is available'
      }
    } catch (error) {
      // Room might not exist yet, which is fine - username is available
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = String(error.message)
        if (errorMessage.includes('room not found') || errorMessage.includes('not_found')) {
          return {
            valid: true,
            message: 'Username is available'
          }
        }
      }
      throw error
    }
  } catch (error) {
    console.error('[Username Validation] Error:', error)

    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error // Re-throw HTTP errors
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to validate username'
    })
  }
})
