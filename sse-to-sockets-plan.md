# SSE to WebSockets Migration Plan

## Overview
This document tracks the migration of Lastra Chat from Server-Sent Events (SSE) + POST endpoints to a unified WebSocket architecture. This change will provide:
- Bidirectional real-time communication
- Simplified WebRTC signaling
- Reduced connection overhead
- Better error handling and reconnection logic

## Current Architecture Issues
- **SSE Limitations**: One-way communication requires separate POST endpoints for client->server messages
- **WebRTC Complexity**: Signaling requires coordination between SSE and POST endpoints
- **Connection Management**: Two separate systems (SSE connections + global sseConnections map)
- **State Synchronization**: Complex coordination between multiple endpoints

## Target Architecture
- Single WebSocket connection per client
- Unified message routing
- Built-in bidirectional communication for WebRTC
- Simplified state management

---

## Phase 1: Enable WebSocket Support ⚙️

### Configuration
- [ ] Update `nuxt.config.ts` to enable experimental WebSocket support
  ```typescript
  nitro: {
    experimental: {
      websocket: true
    }
  }
  ```
- [ ] Verify WebSocket support is working with test endpoint
- [ ] Document any platform-specific limitations

---

## Phase 2: Create Core WebSocket Handler 🔌

### Server Implementation (`/server/api/chat.ws.ts`)
- [ ] Create WebSocket handler with typed message system
- [ ] Implement connection lifecycle:
  - [ ] `open`: Register new connections
  - [ ] `message`: Route messages by type
  - [ ] `close`: Clean up disconnected clients
  - [ ] `error`: Handle connection errors
- [ ] Set up peer management:
  - [ ] Track connected clients
  - [ ] Store user metadata (id, name, mediaState)
  - [ ] Implement broadcast functionality
- [ ] Add heartbeat/ping-pong mechanism
  - [ ] Client sends ping every 30s
  - [ ] Server responds with pong
  - [ ] Disconnect inactive clients

### Message Types to Implement
- [ ] `auth`: Initial authentication with userId/userName
- [ ] `chat`: Regular chat messages
- [ ] `typing`: Typing indicators
- [ ] `presence`: User join/leave notifications
- [ ] `webrtc-signal`: WebRTC signaling (offer/answer/ICE)
- [ ] `media-state`: Camera/mic/screen state updates
- [ ] `bot-toggle`: Enable/disable bots
- [ ] `clear`: Clear chat history
- [ ] `ai-request`: Trigger AI responses
- [ ] `ping`/`pong`: Connection health

---

## Phase 3: Migrate Server-Side Functionality 🔄

### Core Features to Port
- [ ] **User Presence Management**
  - [ ] Port from `chat-stream.get.ts`
  - [ ] Track online users in WebSocket handler
  - [ ] Broadcast user list updates

- [ ] **Message History**
  - [ ] Maintain message buffer (limit: 256)
  - [ ] Send history on new connection
  - [ ] Implement message persistence if needed

- [ ] **Chat Functionality**
  - [ ] Port from `chat-message.post.ts`
  - [ ] Handle regular messages
  - [ ] System messages (join/leave)
  - [ ] Message broadcasting

- [ ] **Typing Indicators**
  - [ ] Port from `chat-typing.post.ts`
  - [ ] Track typing state per user
  - [ ] Auto-clear after timeout

- [ ] **Bot Integration**
  - [ ] Port from `bot-toggle.post.ts`
  - [ ] Maintain bot state
  - [ ] Handle AI message streaming
  - [ ] Support multiple bot personalities

- [ ] **WebRTC Signaling**
  - [ ] Port from `chat-signal.post.ts`
  - [ ] Handle offer/answer exchange
  - [ ] Route ICE candidates
  - [ ] Manage media state updates

- [ ] **Chat Management**
  - [ ] Port from `chat-clear.post.ts`
  - [ ] Clear message history
  - [ ] Broadcast clear event

### Endpoints to Remove
- [ ] `chat-stream.get.ts` (SSE)
- [ ] `chat-message.post.ts`
- [ ] `chat-typing.post.ts`
- [ ] `chat-signal.post.ts`
- [ ] `chat-clear.post.ts`
- [ ] `chat-ready.post.ts`
- [ ] `bot-toggle.post.ts`
- [ ] `screen-share-signal.post.ts` (if redundant)

---

## Phase 4: Create Client-Side WebSocket Composable 🎯

### Core Composable (`useWebSocketChat`)
- [ ] Create using VueUse's `useWebSocket`
- [ ] Implement features:
  - [ ] Auto-reconnection with exponential backoff
  - [ ] Message queue for offline resilience
  - [ ] Connection state management
  - [ ] Typed message sending/receiving
  - [ ] Error handling

### API Design
```typescript
interface UseWebSocketChatOptions {
  url?: string
  autoConnect?: boolean
  reconnectLimit?: number
  reconnectInterval?: number
  heartbeatInterval?: number
}

interface UseWebSocketChatReturn {
  // Connection
  status: Ref<'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED'>
  connect: () => void
  disconnect: () => void

  // Messaging
  send: (type: string, data: any) => void
  on: (type: string, handler: Function) => void
  off: (type: string, handler: Function) => void

  // State
  isConnected: ComputedRef<boolean>
  error: Ref<Error | null>
}
```

---

## Phase 5: Update Existing Composables 🔧

### Composables to Refactor
- [ ] **`useChatSSE`** → `useWebSocketChat`
  - [ ] Replace EventSource with WebSocket
  - [ ] Update event handlers to message handlers
  - [ ] Maintain same public API if possible

- [ ] **`useChatActions`**
  - [ ] Replace POST requests with WebSocket sends
  - [ ] Update sendMessage, sendTyping, clearChat
  - [ ] Add message queuing for offline

- [ ] **`useMediaStream`**
  - [ ] Update signaling to use WebSocket
  - [ ] Remove dependency on POST endpoints
  - [ ] Simplify connection flow

- [ ] **`useChatState`**
  - [ ] Ensure compatibility with WebSocket events
  - [ ] Update any SSE-specific logic

---

## Phase 6: Testing & Quality Assurance ✅

### Functional Testing
- [ ] **Connection Management**
  - [ ] Initial connection establishment
  - [ ] Auto-reconnection on disconnect
  - [ ] Graceful shutdown

- [ ] **Chat Features**
  - [ ] Send/receive messages
  - [ ] Typing indicators
  - [ ] User presence updates
  - [ ] Message history on join

- [ ] **WebRTC Integration**
  - [ ] Camera/mic toggle
  - [ ] Screen sharing
  - [ ] Offer/answer exchange
  - [ ] ICE candidate handling

- [ ] **Bot Interaction**
  - [ ] Bot responses
  - [ ] AI streaming
  - [ ] Bot toggle functionality

- [ ] **Edge Cases**
  - [ ] Multiple tabs/windows
  - [ ] Network interruptions
  - [ ] Server restart handling

### Performance Testing
- [ ] Connection overhead comparison
- [ ] Message latency measurements
- [ ] Memory usage monitoring
- [ ] Stress test with multiple users

---

## Phase 7: Cleanup & Documentation 🧹

### Code Cleanup
- [ ] Remove all SSE-related code
- [ ] Delete obsolete POST endpoints
- [ ] Remove unused imports and dependencies
- [ ] Update TypeScript types

### Documentation
- [ ] Update README with WebSocket details
- [ ] Document message protocol
- [ ] Add connection troubleshooting guide
- [ ] Create migration notes for deployment

---

## Rollback Plan 🔙
If issues arise during migration:
1. Keep SSE code in separate branch until stable
2. Implement feature flag to toggle between SSE/WebSocket
3. Gradual rollout to subset of users
4. Monitor error rates and performance metrics

---

## Success Metrics 📊
- [ ] All existing features working
- [ ] Reduced server resource usage
- [ ] Lower message latency
- [ ] Improved WebRTC connection success rate
- [ ] Zero message loss during reconnection

---

## Notes & Considerations 📝
- WebSocket support in Nitro is experimental (as of 2024)
- Consider fallback to SSE for incompatible environments
- Monitor browser WebSocket limits
- Plan for horizontal scaling with multiple servers
- Consider implementing message acknowledgments for critical operations

---

## Migration Status
**Started**: [Date]
**Target Completion**: [Date]
**Current Phase**: Phase 1
**Blockers**: None

---

*This document will be updated as the migration progresses.*