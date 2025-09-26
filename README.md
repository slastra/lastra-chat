# Lastra Chat

Real-time chat application built with Nuxt 4 and LiveKit, featuring WebRTC-based video, audio, screen sharing, instant messaging, file sharing, and AI bot integration with DiceBear avatars.

## Features

### Core Functionality
- **WebRTC Communication**: Video, audio, and screen sharing via LiveKit SFU
- **Real-time Messaging**: Data channel-based instant messaging with typing indicators
- **File Sharing**: Upload and share images, videos, audio, documents, and archives
- **DiceBear Avatars**: Unique geometric avatar generation using identicon style
- **Name-only Entry**: Join conversations without registration or authentication
- **Device Management**: Camera, microphone, and speaker selection with live switching
- **Adaptive Streaming**: Dynamic video quality based on network conditions
- **Click-to-Download**: File attachments with original filename preservation

### AI Integration
- **Multiple AI Bots**: Configurable bots powered by Google Gemini
- **Natural Language Triggers**: Activate bots via @mentions
- **Context-Aware Responses**: Bots use conversation history for relevant responses
- **Bot Management**: Enable/disable bots through UI with persistent state

### User Experience
- **Media Controls**: Intuitive controls for camera, microphone, and screen sharing
- **Audio Level Monitoring**: Real-time audio level visualization
- **Sound Notifications**: Customizable sound effects for chat events (messages, joins, leaves, AI responses)
- **Push Notifications**: ntfy.sh integration for message notifications when away
- **Connection Status**: Real-time connection state indicators
- **Responsive Design**: Mobile-friendly interface with Nuxt UI v4 components
- **File Upload Modal**: Drag-and-drop or button-based file selection with progress tracking
- **Rich Media Display**: Inline preview for images, video, and audio files

## Technology Stack

- **Framework**: Nuxt 4.1.2, Vue 3.5.21, TypeScript 5.9.2
- **WebRTC**: LiveKit Server (SFU architecture)
- **UI Library**: Nuxt UI v4.0.0 (stable)
- **Avatars**: DiceBear Core 9.2.4 with Identicon style
- **AI Provider**: Google Gemini AI
- **Real-time**: LiveKit data channels
- **File Storage**: Local filesystem with organized structure
- **Notifications**: ntfy.sh integration

## Setup

### Prerequisites
- Node.js 18+
- pnpm 10.15.1
- LiveKit Server (for WebRTC functionality)

### Installation

1. Install dependencies:
```bash
pnpm install
```

2. Configure environment:
```bash
# .env
GEMINI_API_KEY=your-gemini-api-key       # Required for AI bots
GEMINI_MODEL=gemini-2.0-flash-exp        # Default AI model
LIVEKIT_KEY=your-api-key                 # LiveKit API key
LIVEKIT_SECRET=your-api-secret           # LiveKit API secret
LIVEKIT_URL=wss://your-livekit-url       # LiveKit server URL
NUXT_PUBLIC_SITE_URL=https://lastra.us   # Production URL
NTFY_TOPIC=your-ntfy-topic               # ntfy.sh topic for notifications
MY_USERNAME=your-username                # Your username to filter self-notifications
```

### Development

1. Start LiveKit server (development mode):
```bash
livekit-server --dev
```

2. Start Nuxt development server:
```bash
pnpm run dev
```

Application available at `http://localhost:3000`

### Production

Build and deploy:
```bash
pnpm run build
pnpm run preview
```

## LiveKit Configuration

### Development Mode
```bash
livekit-server --dev
# Dashboard: http://localhost:7880
# WebSocket: ws://localhost:7880
```

### Production Configuration
```yaml
# /etc/livekit/config.yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
keys:
  your-api-key: your-api-secret
webhook:
  api_key: your-api-key
```

### Reverse Proxy (Caddy)
```
your-domain.com {
    @websockets {
        header Connection *Upgrade*
        header Upgrade websocket
    }

    handle @websockets {
        reverse_proxy localhost:7880
    }

    handle {
        reverse_proxy localhost:3000
    }
}
```

## Bot Configuration

Create YAML files in `content/bots/`:

```yaml
# content/bots/assistant.yaml
name: "Assistant"
role: "Helpful Assistant"
triggers: [assistant, help]
model: "gemini-2.0-flash-exp"
shyness: 0.5
temperature:
  normal: 0.7
  interjection: 0.9
personality:
  normal: "You are a helpful assistant..."
```

## Commands

```bash
pnpm run dev         # Development server
pnpm run build       # Production build
pnpm run preview     # Preview production
pnpm run typecheck   # TypeScript checking
pnpm run lint        # ESLint with auto-fix
```

## API Endpoints

### LiveKit Integration
- `POST /api/livekit-token` - Generate access tokens
- `POST /api/chat` - Process AI bot messages

### File Management
- `POST /api/upload` - Upload files with validation and storage
- `GET /api/download/[...path]` - Download files with original filenames
- `POST /api/validate-username` - Check username availability

### Bot Management
- `GET /api/bots` - Retrieve bot configurations
- `POST /api/bot-toggle` - Enable/disable bots

### Notifications
- `POST /api/notify` - Send ntfy.sh notifications for messages

## File Upload System

### Supported File Types
- **Images**: JPEG, PNG, GIF, WebP, SVG (max 10MB)
- **Audio**: MP3, WAV, OGG, M4A, WebM (max 25MB)
- **Video**: MP4, WebM, MOV (max 100MB)
- **Documents**: PDF, DOC, DOCX, TXT, MD (max 10MB)
- **Archives**: ZIP, RAR, 7Z, TAR, GZ (max 50MB)

### Storage Structure
Files are organized by upload date:
```
public/uploads/
├── 2024/
│   ├── 01/         # January uploads
│   ├── 02/         # February uploads
│   └── ...
└── [year]/[month]/[uuid-timestamp.ext]
```

## Avatar System

The application uses DiceBear to generate unique identicon-style avatars:
- **Consistent**: Same username always generates the same avatar
- **Unique**: Different usernames create distinct geometric patterns
- **Lightweight**: SVG-based avatars with small file sizes
- **Accessible**: Proper alt text and semantic markup

## License

MIT