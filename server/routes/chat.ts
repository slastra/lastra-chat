import type { ChatMessage, UserPresence } from '../types/chat'
import type { SignalingMessage } from '../../shared/types/webrtc'
import type {
  WSMessage,
  AuthData,
  TypingData,
  BotToggleData
} from '../../shared/types/websocket'
import { loadBots } from '../utils/bots'
import { generateBotResponse, shouldBotInterject } from '../utils/gemini'

// Extended peer with user info
interface ChatPeer {
  userId?: string
  userName?: string
  authenticated?: boolean
  lastActivity?: number
  send: (data: string | Buffer | ArrayBuffer | Uint8Array) => void
  close: () => void
}

// Global state
const peers = new Map<string, ChatPeer>()
const messages: ChatMessage[] = []
const MAX_MESSAGE_HISTORY = 256
const userPresence = new Map<string, UserPresence>()
const botStates = new Map<string, boolean>()

// Heartbeat configuration
const HEARTBEAT_INTERVAL = 30000 // 30 seconds
const HEARTBEAT_TIMEOUT = 60000 // 60 seconds

// Helper function to broadcast to all authenticated peers
function broadcast(message: WSMessage, excludePeer?: ChatPeer) {
  const messageStr = JSON.stringify(message)
  for (const peer of peers.values()) {
    if (peer.authenticated && peer !== excludePeer && typeof peer.send === 'function') {
      try {
        peer.send(messageStr)
      } catch (error) {
        console.error('[WS] Error broadcasting to peer:', error)
      }
    }
  }
}

// Helper function to send to specific peer
function sendToPeer(peer: ChatPeer, message: WSMessage) {
  if (peer && typeof peer.send === 'function') {
    try {
      peer.send(JSON.stringify(message))
    } catch (error) {
      console.error('[WS] Error sending message to peer:', error)
    }
  }
}

// Get active users including bots
async function getUsersWithBots() {
  const bots = await loadBots()
  const activeUsers = Array.from(userPresence.values())

  return [
    ...activeUsers,
    ...bots.map(bot => ({
      userId: `ai-${bot.name.toLowerCase()}`,
      userName: bot.name,
      joinedAt: 0,
      isTyping: false,
      lastActivity: Date.now()
    }))
  ]
}

// Clean up inactive connections
function cleanupInactivePeers() {
  const now = Date.now()
  for (const [id, peer] of peers.entries()) {
    // Only clean up authenticated peers that have been inactive
    if (peer.authenticated && peer.lastActivity && now - peer.lastActivity > HEARTBEAT_TIMEOUT) {
      console.log(`[WS] Cleaning up inactive peer: ${peer.userName || id}`)
      if (typeof peer.close === 'function') {
        peer.close()
      }
      peers.delete(id)
      if (peer.userId) {
        userPresence.delete(peer.userId)
      }
    }
  }
}

// Start cleanup interval
setInterval(cleanupInactivePeers, HEARTBEAT_INTERVAL)

export default defineWebSocketHandler({
  open(peer) {
    console.log('[WS] New connection opened')

    // Extend the peer object with our custom properties
    const chatPeer = peer as ChatPeer
    chatPeer.authenticated = false
    chatPeer.lastActivity = Date.now()

    // Generate temporary ID
    const tempId = `temp-${Date.now()}-${Math.random()}`
    peers.set(tempId, chatPeer)

    // Request authentication
    sendToPeer(chatPeer, {
      type: 'auth-required',
      data: { message: 'Please authenticate with userId and userName' }
    })
  },

  async message(peer, message) {
    const chatPeer = peer as ChatPeer
    chatPeer.lastActivity = Date.now()

    try {
      // Get the text content from the message
      const messageText = typeof message === 'string'
        ? message
        : message.text?.() || message.toString()

      const msg: WSMessage = JSON.parse(messageText)

      console.log(`[WS] Received message type: ${msg.type}${chatPeer.userName ? ` from ${chatPeer.userName}` : ''}`)

      // Handle authentication first
      if (msg.type === 'auth' && !chatPeer.authenticated) {
        await handleAuth(chatPeer, msg as WSMessage<AuthData>)
        return
      }

      // Require authentication for all other messages
      if (!chatPeer.authenticated) {
        sendToPeer(chatPeer, {
          type: 'error',
          data: { message: 'Authentication required' }
        })
        return
      }

      // Route messages by type
      switch (msg.type) {
        case 'ping':
          handlePing(chatPeer)
          break

        case 'chat':
          await handleChatMessage(chatPeer, msg as WSMessage<{ content: string }>)
          break

        case 'typing':
          handleTyping(chatPeer, msg as WSMessage<TypingData>)
          break

        case 'webrtc-signal':
          handleWebRTCSignal(chatPeer, msg.data as SignalingMessage)
          break

        case 'media-state':
          await handleMediaState(chatPeer, msg.data as { webcam?: boolean, microphone?: boolean, screen?: boolean })
          break

        case 'bot-toggle':
          handleBotToggle(chatPeer, msg as WSMessage<BotToggleData>)
          break

        case 'clear':
          handleClear(chatPeer)
          break

        case 'ai-request':
          await handleAIRequest(chatPeer, msg.data as Record<string, unknown> || {})
          break

        default:
          console.warn(`[WS] Unknown message type: ${msg.type}`)
      }
    } catch (error) {
      console.error('[WS] Error handling message:', error)
      sendToPeer(chatPeer, {
        type: 'error',
        data: { message: 'Failed to process message' }
      })
    }
  },

  async close(peer) {
    const chatPeer = peer as ChatPeer
    console.log(`[WS] Connection closed${chatPeer.userName ? ` for ${chatPeer.userName}` : ''}`)

    // Find and remove peer
    let peerKey: string | undefined
    for (const [key, p] of peers.entries()) {
      if (p === chatPeer) {
        peerKey = key
        break
      }
    }

    if (peerKey) {
      peers.delete(peerKey)
    }

    // Remove from presence and notify others
    if (chatPeer.userId && chatPeer.authenticated) {
      userPresence.delete(chatPeer.userId)

      // Create leave message
      const leaveMessage: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random()}`,
        userId: 'system',
        userName: 'System',
        content: `${chatPeer.userName} left the chat`,
        timestamp: Date.now(),
        type: 'system'
      }

      messages.push(leaveMessage)
      if (messages.length > MAX_MESSAGE_HISTORY) {
        messages.splice(0, messages.length - MAX_MESSAGE_HISTORY)
      }

      // Broadcast updates
      broadcast({
        type: 'message',
        data: leaveMessage
      })

      broadcast({
        type: 'user-list',
        data: await getUsersWithBots()
      })
    }
  },

  error(peer, error) {
    const chatPeer = peer as ChatPeer
    console.error(`[WS] Error for ${chatPeer.userName || 'unknown'}:`, error)
  }
})

// Message handlers

async function handleAuth(peer: ChatPeer, msg: WSMessage<AuthData>) {
  const { userId, userName } = msg.data || {}

  if (!userId || !userName) {
    sendToPeer(peer, {
      type: 'error',
      data: { message: 'userId and userName are required' }
    })
    return
  }

  // Update peer info
  peer.userId = userId
  peer.userName = userName
  peer.authenticated = true

  // Update presence
  userPresence.set(userId, {
    userId,
    userName,
    joinedAt: Date.now(),
    isTyping: false,
    lastActivity: Date.now()
  })

  // Update peer tracking
  for (const [key, p] of peers.entries()) {
    if (p === peer && key.startsWith('temp-')) {
      peers.delete(key)
      peers.set(userId, peer)
      break
    }
  }

  // Load bots
  const bots = await loadBots()
  for (const bot of bots) {
    if (!botStates.has(bot.name)) {
      botStates.set(bot.name, true)
    }
  }

  // Send initial data to new user
  sendToPeer(peer, {
    type: 'auth-success',
    data: { userId, userName }
  })

  sendToPeer(peer, {
    type: 'history',
    data: messages
  })

  sendToPeer(peer, {
    type: 'user-list',
    data: await getUsersWithBots()
  })

  sendToPeer(peer, {
    type: 'bot-state',
    data: Object.fromEntries(botStates)
  })

  // Create join message
  const joinMessage: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random()}`,
    userId: 'system',
    userName: 'System',
    content: `${userName} joined the chat`,
    timestamp: Date.now(),
    type: 'system'
  }

  messages.push(joinMessage)
  if (messages.length > MAX_MESSAGE_HISTORY) {
    messages.splice(0, messages.length - MAX_MESSAGE_HISTORY)
  }

  // Broadcast to others
  broadcast({
    type: 'message',
    data: joinMessage
  }, peer)

  broadcast({
    type: 'user-list',
    data: await getUsersWithBots()
  }, peer)

  console.log(`[WS] User ${userName} (${userId}) authenticated`)
}

function handlePing(peer: ChatPeer) {
  sendToPeer(peer, { type: 'pong' })
}

async function handleChatMessage(peer: ChatPeer, msg: WSMessage<{ content: string }>) {
  const { content } = msg.data || {}

  if (!content) return

  const chatMessage: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random()}`,
    userId: peer.userId!,
    userName: peer.userName!,
    content,
    timestamp: Date.now(),
    type: 'user'
  }

  messages.push(chatMessage)
  if (messages.length > MAX_MESSAGE_HISTORY) {
    messages.splice(0, messages.length - MAX_MESSAGE_HISTORY)
  }

  // Broadcast to all users
  broadcast({
    type: 'message',
    data: chatMessage
  })

  // Check if any bots should respond
  await checkBotResponses(chatMessage)
}

function handleTyping(peer: ChatPeer, msg: WSMessage<TypingData>) {
  const { isTyping } = msg.data || {}

  // Update presence
  const presence = userPresence.get(peer.userId!)
  if (presence) {
    presence.isTyping = isTyping ?? false
  }

  // Broadcast typing state
  broadcast({
    type: 'typing',
    data: {
      userId: peer.userId,
      userName: peer.userName,
      isTyping
    }
  }, peer)
}

function handleWebRTCSignal(peer: ChatPeer, signal: SignalingMessage) {
  // Add sender info if not present
  if (!signal.userId) {
    signal.userId = peer.userId!
    signal.userName = peer.userName!
  }

  // Handle media-state updates
  if (signal.type === 'media-state' && signal.mediaState) {
    const presence = userPresence.get(peer.userId!)
    if (presence) {
      presence.mediaState = {
        webcam: signal.mediaState.webcam ?? presence.mediaState?.webcam ?? false,
        microphone: signal.mediaState.microphone ?? presence.mediaState?.microphone ?? false,
        screen: signal.mediaState.screen ?? presence.mediaState?.screen ?? false
      }
    }
  }

  // Route to target or broadcast
  if (signal.targetUserId) {
    const targetPeer = peers.get(signal.targetUserId)
    if (targetPeer) {
      sendToPeer(targetPeer, {
        type: 'webrtc-signal',
        data: signal
      })
    }
  } else {
    broadcast({
      type: 'webrtc-signal',
      data: signal
    }, peer)
  }
}

async function handleMediaState(peer: ChatPeer, mediaState: { webcam?: boolean, microphone?: boolean, screen?: boolean }) {
  // Update user presence
  const presence = userPresence.get(peer.userId!)
  if (presence) {
    presence.mediaState = {
      webcam: mediaState.webcam ?? presence.mediaState?.webcam ?? false,
      microphone: mediaState.microphone ?? presence.mediaState?.microphone ?? false,
      screen: mediaState.screen ?? presence.mediaState?.screen ?? false
    }
  }

  // Broadcast updated user list
  broadcast({
    type: 'user-list',
    data: await getUsersWithBots()
  })

  // Also broadcast as webrtc-signal for compatibility
  broadcast({
    type: 'webrtc-signal',
    data: {
      type: 'media-state',
      userId: peer.userId,
      userName: peer.userName,
      mediaState
    }
  }, peer)
}

function handleBotToggle(peer: ChatPeer, msg: WSMessage<BotToggleData>) {
  const { botName, enabled } = msg.data || {}

  if (!botName) return

  botStates.set(botName, enabled ?? false)

  // Broadcast bot state change
  broadcast({
    type: 'bot-toggle',
    data: { botName, enabled }
  })
}

function handleClear(peer: ChatPeer) {
  // Clear messages
  messages.length = 0

  // Add clear notification
  const clearMessage: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random()}`,
    userId: 'system',
    userName: 'System',
    content: `Chat cleared by ${peer.userName}`,
    timestamp: Date.now(),
    type: 'system'
  }

  messages.push(clearMessage)

  // Broadcast clear event
  broadcast({
    type: 'clear',
    data: {
      clearedBy: peer.userName,
      message: clearMessage
    }
  })
}

async function handleAIRequest(peer: ChatPeer, data: Record<string, unknown>) {
  // This would integrate with your AI bots
  // For now, just log
  console.log(`[WS] AI request from ${peer.userName}:`, data)
}

async function checkBotResponses(message: ChatMessage) {
  // Don't respond to system or bot messages
  if (message.type !== 'user') return

  // Get current user count for interjection probability
  const userCount = userPresence.size

  // Check if any enabled bots should respond
  for (const [botName, enabled] of botStates.entries()) {
    if (!enabled) continue

    // Load bot configuration
    const bots = await loadBots()
    const bot = bots.find(b => b.name === botName)
    if (!bot) continue

    // Check if bot is mentioned directly
    const isMentioned = bot.triggers.some(trigger =>
      message.content.toLowerCase().includes(trigger.toLowerCase())
      || message.content.includes(`@${bot.name}`)
    )

    // Determine if bot should respond (either mentioned or random interjection)
    const shouldRespond = isMentioned || shouldBotInterject(bot, userCount)

    if (shouldRespond) {
      console.log(`[WS] Bot ${botName} responding to: ${message.content}`)

      try {
        // Generate bot response
        const botResponse = await generateBotResponse({
          bot,
          message,
          recentMessages: messages.slice(-20), // Last 20 messages for context
          userCount
        })

        // Create bot message
        const botMessage: ChatMessage = {
          id: `bot-${Date.now()}-${Math.random()}`,
          userId: `bot-${bot.name}`,
          userName: bot.name,
          content: botResponse,
          timestamp: Date.now(),
          type: 'bot'
        }

        // Add to message history
        messages.push(botMessage)
        if (messages.length > MAX_MESSAGE_HISTORY) {
          messages.shift()
        }

        // Broadcast bot message with a small delay to feel more natural
        setTimeout(() => {
          broadcast({
            type: 'message',
            data: botMessage
          })
        }, 500 + Math.random() * 1000) // 0.5-1.5 second delay
      } catch (error) {
        console.error(`[WS] Failed to generate bot response for ${botName}:`, error)
      }
    }
  }
}
