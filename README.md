# Lastra Chat

Real-time chat application built with Nuxt 3, featuring Server-Sent Events (SSE) for instant messaging and configurable AI bots powered by Google Gemini. Users can join conversations using only their name, with no authentication required.

## Features

### Core Functionality
- **Name-only entry**: Join conversations without registration or authentication
- **Real-time messaging**: Server-Sent Events (SSE) for instant message delivery
- **Message history**: 256 message limit with in-memory storage
- **Auto-reconnection**: Exponential backoff reconnection with up to 10 attempts
- **Typing indicators**: Real-time typing status for active users
- **Online presence**: Live user list with resizable sidebar

### AI Integration
- **Multiple AI bots**: Configurable bots with YAML-based configuration
- **Trigger system**: Activate bots via @mentions in messages
- **Bot-to-bot communication**: Support for bot conversations (max 4 exchanges)
- **Streaming responses**: Real-time AI response streaming with proper isolation
- **Context awareness**: Bots use last 10 messages for context
- **Toggle controls**: Enable/disable bots via UI with server-side state persistence

### Advanced Features
- **Slash commands**: Built-in command system with autocomplete
- **Push notifications**: Integration with ntfy.sh for external notifications
- **Connection monitoring**: Health check pings and connection status indicators
- **Message status tracking**: Sending, sent, failed, and streaming states
- **Auto-scroll**: Automatic scrolling to latest messages

## Technology Stack

- **Framework**: Nuxt 3, Vue 3, TypeScript
- **UI Library**: Nuxt UI v3 (@nuxt/ui v4.0.0-alpha)
- **Real-time**: Server-Sent Events (SSE), Nitro
- **AI Provider**: Google Gemini AI
- **Notifications**: ntfy.sh
- **Storage**: In-memory (messages lost on server restart)

## Project Structure

```
app/
├── pages/
│   ├── index.vue          # Entry page with name input
│   └── chat.vue           # Main chat interface
├── components/
│   ├── ChatInput.vue      # Message input component
│   ├── ChatMessageList.vue # Message container
│   ├── ChatMessageItem.vue # Individual message display
│   └── ChatUserList.vue   # Online users sidebar
├── composables/
│   ├── useChat.ts         # Main chat orchestrator
│   ├── useChatState.ts    # State management
│   ├── useChatSSE.ts      # SSE connection handling
│   ├── useChatActions.ts  # Message sending actions
│   ├── useUser.ts         # User session management
│   ├── useBots.ts         # Bot configuration
│   └── useSlashCommands.ts # Slash command system
└── plugins/
    └── clientId.client.ts # Client ID generation

server/
├── api/
│   ├── chat-stream.get.ts # SSE endpoint for real-time updates
│   ├── chat-message.post.ts # Message posting endpoint
│   ├── chat-typing.post.ts # Typing indicator endpoint
│   ├── chat-clear.post.ts # Clear chat history endpoint
│   ├── chat-ready.post.ts # Client ready signal endpoint
│   ├── bot-toggle.post.ts # Bot enable/disable endpoint
│   └── bots.get.ts        # Bot configuration loader
└── utils/
    ├── bots.ts            # Bot logic and management
    ├── ntfy.ts            # Notification utilities
    └── bot-response-manager.ts # Response isolation

content/bots/*.yaml        # Bot configuration files
```

## Setup

### Prerequisites
- Node.js (18+)
- pnpm

### Installation

1. Install dependencies:
```bash
pnpm install
```

2. Create environment configuration:
```bash
# .env
GEMINI_API_KEY=your-gemini-api-key       # Required for AI functionality
GEMINI_MODEL=gemini-2.5-flash-lite       # Optional, default model
NUXT_PUBLIC_SITE_URL=https://lastra.us   # Production domain for assets
```

### Development

Start the development server:
```bash
pnpm run dev
```

The application will be available at `http://localhost:3000`.

### Production

Build for production:
```bash
pnpm run build
```

Preview production build:
```bash
pnpm run preview
```

## Configuration

### Bot Configuration

Bots are configured using YAML files in the `content/bots/` directory:

```yaml
# content/bots/example.yaml
name: "Assistant"
role: "Helpful Assistant"
triggers: [assistant, help]
model: "gemini-2.0-flash-exp"  # Optional, overrides default
shyness: 0.5                   # 0=chatty, 1=never interjects
temperature:
  normal: 0.7                  # Temperature for direct responses
  interjection: 0.9            # Temperature for spontaneous responses
tools: [googleSearch]          # Optional tool integrations
personality:
  normal: "You are a helpful assistant..."
  interjection: "Brief, contextual responses..."
```

### Notification Settings

Notifications are sent via ntfy.sh to the `lastra` topic:
- **Service**: ntfy.sh
- **Topic**: `lastra` (hardcoded)
- **Filtering**: Excludes messages from user "shaun" and AI bots
- **Priorities**: System messages (min), User messages (default)

## API Endpoints

### Real-time Communication
- `GET /api/chat-stream` - SSE endpoint for real-time updates
- `POST /api/chat-message` - Send new messages
- `POST /api/chat-typing` - Update typing indicators
- `POST /api/chat-ready` - Signal client ready state

### Bot Management
- `GET /api/bots` - Retrieve bot configurations
- `POST /api/bot-toggle` - Enable/disable specific bots

### System Commands
- `POST /api/chat-clear` - Clear chat history for all users

## Slash Commands

Available commands:
- `/clear` - Clear chat history for all participants
- `/help` - Display available commands

Commands are triggered by typing `/` and provide autocomplete suggestions.

## Data Structures

```typescript
interface ChatMessage {
  id: string
  userId: string
  userName: string
  content: string
  timestamp: number
  type: 'user' | 'system' | 'ai'
  status?: 'sending' | 'sent' | 'failed' | 'streaming'
}

interface UserPresence {
  userId: string
  userName: string
  joinedAt: number
  isTyping: boolean
  lastActivity: number
}

type SSEEventType = 'history' | 'message' | 'user-list' | 'typing' |
                    'ai-start' | 'ai-chunk' | 'ai-complete' |
                    'ai-error' | 'ping' | 'clear' |
                    'bot-state' | 'bot-toggle'
```

## Development Commands

```bash
pnpm install               # Install dependencies
pnpm run dev              # Start development server
pnpm run build            # Build for production
pnpm run preview          # Preview production build
pnpm run typecheck        # Run TypeScript type checking
pnpm run lint             # Run ESLint
pnpm run clean            # Clean cache files
pnpm run clean:build      # Clean build output
```

## Technical Implementation

### Server-Sent Events (SSE)
- Promise-based initial data delivery
- Exponential backoff reconnection (maximum 10 attempts)
- Event handler cleanup on reconnect to prevent duplication
- Health check pings every 60 seconds
- Connection throttling (1 second minimum between attempts)

### Message Handling
- Optimistic updates with status tracking
- Deduplication via unique message IDs
- Map-based state management for efficiency
- 256 message history limit

### Bot System
- YAML-based configuration files
- Shyness parameter controls interjection frequency
- Natural response delays (1.5-3.5 seconds for interjections)
- Concurrent processing with sequential streaming
- Server-side enable/disable state persistence


