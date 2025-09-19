import { loadBots } from '../utils/bots'
import { sendChatNotification } from '../utils/ntfy'

export interface ChatMessage {
  id: string
  userId: string
  userName: string
  content: string
  timestamp: number
  type: 'user' | 'system' | 'ai'
  status?: 'sending' | 'sent' | 'failed' | 'streaming'
}

export interface UserPresence {
  userId: string
  userName: string
  joinedAt: number
  isTyping: boolean
  lastActivity: number
}

interface ConnectedClient {
  stream: ReturnType<typeof createEventStream>
  userId: string
  userName: string
  isReady?: boolean
  initialDataSent?: boolean
}

const messages: ChatMessage[] = []
const MAX_MESSAGE_HISTORY = 256 // Prevent memory leak
const connectedClients = new Set<ConnectedClient>()
const userPresence = new Map<string, UserPresence>()

// Global bot state management
const botStates = new Map<string, boolean>() // botName -> enabled

// Periodic cleanup of dead connections - only start when first connection is made
let cleanupInterval: NodeJS.Timeout | null = null

function startCleanupInterval() {
  if (!cleanupInterval) {
    cleanupInterval = setInterval(() => {
      const deadClients: ConnectedClient[] = []

      // Test each client connection
      connectedClients.forEach((client) => {
        client.stream.push({
          event: 'ping',
          data: 'health-check'
        }).catch(() => {
          // Connection is dead
          deadClients.push(client)
        })
      })

      // Remove dead clients
      if (deadClients.length > 0) {
        console.log(`[SSE] Cleaning up ${deadClients.length} dead connections`)
        deadClients.forEach((client) => {
          connectedClients.delete(client)
          userPresence.delete(client.userId)
        })
      }

      // Stop cleanup if no clients connected
      if (connectedClients.size === 0) {
        clearInterval(cleanupInterval!)
        cleanupInterval = null
        console.log('[SSE] Stopped cleanup interval - no clients connected')
      }
    }, 60000) // Every minute
    console.log('[SSE] Started cleanup interval')
  }
}

// Bots are now cached in the loadBots function itself

export default defineEventHandler(async (event) => {
  console.log('[SSE] New connection attempt')
  const query = getQuery(event)
  const userId = query.userId as string
  const userName = query.userName as string

  console.log('[SSE] Connection params:', { userId, userName })

  if (!userId || !userName) {
    throw createError({
      statusCode: 400,
      statusMessage: 'userId and userName are required'
    })
  }

  const eventStream = await createEventStream(event)
  console.log('[SSE] Event stream created')

  const client: ConnectedClient = {
    stream: eventStream,
    userId,
    userName,
    isReady: false,
    initialDataSent: false
  }
  connectedClients.add(client)

  // Start cleanup interval when first client connects
  if (connectedClients.size === 1) {
    startCleanupInterval()
  }

  userPresence.set(userId, {
    userId,
    userName,
    joinedAt: Date.now(),
    isTyping: false,
    lastActivity: Date.now()
  })

  // Load bots for user list
  const bots = await loadBots(event)

  // Initialize bot states if not already set
  for (const bot of bots) {
    if (!botStates.has(bot.name)) {
      botStates.set(bot.name, true) // All bots enabled by default
    }
  }

  // Prepare initial data
  const activeUsers = Array.from(userPresence.values())
  const usersWithBots = [
    ...activeUsers,
    ...bots.map(bot => ({
      userId: `ai-${bot.name.toLowerCase()}`,
      userName: bot.name,
      joinedAt: 0, // Always been here
      isTyping: false,
      lastActivity: Date.now()
    }))
  ]

  // Create a queue for initial events
  const initialEvents: Array<{ event: string, data: string }> = []

  // Queue the initial data
  initialEvents.push({
    event: 'history',
    data: JSON.stringify(messages) // Already limited to MAX_MESSAGE_HISTORY
  })

  initialEvents.push({
    event: 'user-list',
    data: JSON.stringify(usersWithBots)
  })

  // Add bot states to initial data
  initialEvents.push({
    event: 'bot-state',
    data: JSON.stringify(Object.fromEntries(botStates))
  })

  // Send initial data with retry logic
  const sendInitialData = async () => {
    if (client.initialDataSent) return

    console.log('[SSE] Sending initial data to', userName)
    let allSent = true

    for (const evt of initialEvents) {
      try {
        await eventStream.push(evt)
        console.log(`[SSE] Sent ${evt.event} event to ${userName}`)
      } catch (error) {
        console.error(`[SSE] Error sending ${evt.event} to ${userName}:`, error)
        allSent = false
        break
      }
    }

    if (allSent) {
      client.initialDataSent = true
      console.log('[SSE] Initial data successfully sent to', userName)
    } else {
      // Retry after a short delay
      setTimeout(() => sendInitialData(), 1000)
    }
  }

  const joinMessage: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random()}`,
    userId: 'system',
    userName: 'System',
    content: `${userName} joined the chat`,
    timestamp: Date.now(),
    type: 'system'
  }
  messages.push(joinMessage)
  // Trim messages if exceeding limit
  if (messages.length > MAX_MESSAGE_HISTORY) {
    messages.splice(0, messages.length - MAX_MESSAGE_HISTORY)
  }

  // Broadcast join message with error handling
  const broadcastPromises = []
  for (const otherClient of connectedClients) {
    if (otherClient.userId !== userId && otherClient.initialDataSent) {
      broadcastPromises.push(
        otherClient.stream.push({
          event: 'message',
          data: JSON.stringify(joinMessage)
        }).catch((err) => {
          console.error(`[SSE] Failed to send join message to ${otherClient.userName}:`, err)
        })
      )
    }
  }
  await Promise.allSettled(broadcastPromises)

  // Send join notification to ntfy.sh (skip if user is shaun)
  if (userName.toLowerCase() !== 'shaun') {
    sendChatNotification('System', `${userName} joined the chat`, 'system').catch(err =>
      console.error('[SSE] Failed to send join notification:', err)
    )
  }

  // Send updated user list to other clients immediately
  const userListPromises = []
  for (const c of connectedClients) {
    if (c.userId !== userId && c.initialDataSent) {
      userListPromises.push(
        c.stream.push({
          event: 'user-list',
          data: JSON.stringify(usersWithBots)
        }).catch((err) => {
          console.error(`[SSE] Failed to send user list update to ${c.userName}:`, err)
        })
      )
    }
  }
  await Promise.allSettled(userListPromises)

  // Set up heartbeat with error handling
  const heartbeatInterval = setInterval(async () => {
    try {
      await eventStream.push({
        event: 'ping',
        data: 'ping'
      })
    } catch (error) {
      console.error('[SSE] Heartbeat failed for', userName, error)
      cleanup()
    }
  }, 30000)

  // Send initial data after a short delay to ensure client is ready
  // Better approach: wait for the client's open event handler to fire first
  setTimeout(async () => {
    await sendInitialData()
  }, 100)

  const cleanup = () => {
    console.log('[SSE] Cleaning up connection for:', userName)

    try {
      clearInterval(heartbeatInterval)
    } catch (error) {
      console.error('[SSE] Error clearing heartbeat interval:', error)
    }

    connectedClients.delete(client)
    userPresence.delete(userId)

    const leaveMessage: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      userId: 'system',
      userName: 'System',
      content: `${userName} left the chat`,
      timestamp: Date.now(),
      type: 'system'
    }

    messages.push(leaveMessage)
    // Trim messages if exceeding limit
    if (messages.length > MAX_MESSAGE_HISTORY) {
      messages.splice(0, messages.length - MAX_MESSAGE_HISTORY)
    }

    // Notify remaining clients with error handling
    for (const c of connectedClients) {
      if (c.stream && c.initialDataSent) {
        c.stream.push({
          event: 'message',
          data: JSON.stringify(leaveMessage)
        }).catch((err) => {
          console.error(`[SSE] Failed to send leave message to ${c.userName}:`, err)
        })
      }
    }

    // Send leave notification to ntfy.sh (skip if user is shaun)
    if (userName.toLowerCase() !== 'shaun') {
      sendChatNotification('System', `${userName} left the chat`, 'system').catch(err =>
        console.error('[SSE] Failed to send leave notification:', err)
      )
    }

    const activeUsers = Array.from(userPresence.values())
    // Add all configured bots as permanent users
    Promise.resolve(loadBots(event)).then((bots) => {
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
      for (const c of connectedClients) {
        if (c.initialDataSent) {
          c.stream.push({
            event: 'user-list',
            data: JSON.stringify(usersWithBots)
          }).catch((err) => {
            console.error(`[SSE] Failed to send updated user list to ${c.userName}:`, err)
          })
        }
      }
    })
  }

  eventStream.onClosed(() => {
    console.log('[SSE] Connection closed for user:', userName)
    cleanup()
  })

  console.log('[SSE] Returning event stream for user:', userName)
  return eventStream.send()
})

export { messages, connectedClients, userPresence, botStates }
