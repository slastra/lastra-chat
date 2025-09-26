# Project Instructions for Claude Code

## Documentation Resources Quick Reference

### When to Use Each Documentation File
- **Use `livekit.txt`** for: WebRTC features, video/audio/screen sharing, room management, data channels, AI agents, track management
- **Use `nuxt-ui.txt`** for: UI components, forms, dropdowns, buttons, modals, themes, styling, component props/events
- **Use `nuxt.txt`** for: Nuxt configuration, server/client code, plugins, modules, SSR/SSG, routing, composables

### Documentation Access Methods
1. **Local Files**: Reference the `.txt` files in the project root for comprehensive API documentation
2. **Nuxt UI Online**: Use `https://ui.nuxt.com/raw/components/<component-name>.md` for component docs
3. **Search Within Files**: Use grep/search to find specific APIs or patterns within documentation files

## Project Overview

This is a Nuxt 4 real-time chat application using LiveKit for WebRTC-based video, audio, screen sharing, and messaging. The project uses TypeScript, Vue 3 Composition API, Nuxt UI v4 components, and integrates AI bots via Google Gemini.

## Technology Stack

### Core Dependencies
- **Nuxt 4.1.2** - Vue 3 full-stack framework
- **Nuxt UI 4.0.0** - Component library (stable)
- **LiveKit Client 2.15.7** - WebRTC SFU client
- **LiveKit Server SDK 2.13.3** - Server-side LiveKit integration
- **Google Generative AI 1.20.0** - Gemini AI integration
- **Vue 3.5.21** - Reactive frontend framework
- **TypeScript 5.9.2** - Type-safe development

### Development Tools
- **pnpm 10.15.1** - Package manager
- **Vite** - Build tool and dev server
- **ESLint** - Code linting
- **vue-tsc** - TypeScript checking for Vue

## Key Requirements

### Type Safety
- **NEVER** use `any` or `unknown` types - always define proper TypeScript interfaces
- Type definitions follow Nuxt 4 structure:
  - `/shared/types/` - Types used by both client and server
  - `/server/types/` - Server-only types
  - `/app/types/` - Client-only types (when needed)
- Server-side global variables must use helper functions from `server/utils/globalStore.ts`

### Code Quality
- Always run `pnpm run lint` and `pnpm run typecheck` before considering work complete
- Fix all linting errors - no exceptions
- Prefer editing existing files over creating new ones
- Never create documentation files unless explicitly requested

### Security
- Use MDC component for rendering markdown, not v-html (security requirement)
- Never expose or log secrets, keys, or credentials
- Follow all security best practices

## Commands

```bash
# Type checking
pnpm run typecheck

# Linting (with auto-fix)
pnpm run lint

# Development server
pnpm run dev

# Build
pnpm run build

# Clean cache and build artifacts
pnpm run clean

# Clean build artifacts only
pnpm run clean:build
```

## LiveKit Integration (Production Ready)

### Environment Variables
```env
LIVEKIT_KEY=devkey                    # API key for token generation
LIVEKIT_SECRET=secret                 # API secret for token generation
LIVEKIT_URL=ws://localhost:7880       # LiveKit server URL (dev mode)
```

### Development Setup
1. **Start LiveKit Server**: `livekit-server --dev`
2. **Dashboard**: Available at http://localhost:7880 in dev mode
3. **CLI Tool**: Use `lk` command for room management and testing

### LiveKit CLI Tools

The `lk` command-line tool is essential for debugging and monitoring:

```bash
# List active rooms
lk room list

# Get room details and participants
lk room info <room-name>

# Monitor tracks and quality in real-time
lk room get-participants <room-name>

# Inspect specific track statistics
lk track info <room-name> <participant-identity>

# Test room connection and media
lk load-test room --room <room-name> --publishers 1
```

Use `lk` to verify stream quality, debug connection issues, and monitor real-time performance metrics.

### Current Architecture

#### Screen Sharing Configuration (60fps AV1)
The project uses high-performance screen sharing with:
- **60 FPS** at 1080p resolution
- **AV1 codec** for optimal compression
- **12 Mbps bitrate** for professional quality
- **Monitor capture mode** to bypass browser throttling

Implementation pattern:
```typescript
const tracks = await room.value.localParticipant.createScreenTracks({
  audio: true,
  resolution: {
    width: 1920,
    height: 1080,
    frameRate: 60
  },
  video: {
    displaySurface: 'monitor'
  },
  contentHint: 'motion',
  selfBrowserSurface: 'exclude'
})
```

#### Track Management Best Practices
- **Video Track Attachment**: Use Vue template refs, not DOM IDs
- **Audio Feedback Prevention**: Exclude local participant from screen share audio
- **Track Lifecycle**: Always clean up track subscriptions on component unmount
- **Device Switching**: Use LiveKit's `switchActiveDevice()` API

#### Data Channels
- **Reliable**: Chat messages, bot responses, system notifications
- **Unreliable**: Typing indicators, ephemeral updates
- **Message Limit**: 16KB per message (chunk larger messages)

### LiveKit Composables Architecture
- `useLiveKitRoom.ts` - Core room connection, media tracks, participant management
- `useLiveKitChat.ts` - Chat messaging via data channels, typing indicators
- `useLiveKitBots.ts` - AI bot integration with LiveKit data channels
- `useLiveKitChatState.ts` - Bridge for legacy UI component compatibility

## Nuxt 4 TypeScript Structure

### Type File Organization
- `/shared/types/` - Types shared between client and server
  - `webrtc.ts` - WebRTC-related interfaces
  - `index.ts` - Re-exports
- `/server/types/` - Server-side types only
  - `global.d.ts` - Server global declarations
- `/server/utils/globalStore.ts` - Type-safe server global state accessors
- `/app/types/` - Client-side types (empty, for future use)

### TypeScript Project References
Nuxt 4 uses project references in `tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./.nuxt/tsconfig.app.json" },
    { "path": "./.nuxt/tsconfig.server.json" },
    { "path": "./.nuxt/tsconfig.shared.json" },
    { "path": "./.nuxt/tsconfig.node.json" }
  ]
}
```

Each context has separate TypeScript configuration with appropriate globals and APIs.

## Nuxt UI v4 Components

**Current Version**: Nuxt UI v4.0.0 (stable)

### Key Component Categories
**Layout & Structure:**
- DashboardGroup, DashboardNavbar, DashboardPanel, DashboardSidebar
- Container, Main, Page, PageBody, Header, Footer

**Forms & Inputs:**
- Form, FormField, Input, Select, Textarea
- Checkbox, RadioGroup, Switch, Slider

**Buttons & Actions:**
- Button, ButtonGroup
- DropdownMenu, CommandPalette

**Display Components:**
- Alert, Badge, Card, Modal, Popover, Tooltip
- Avatar, Progress, Skeleton

**Chat Components:**
- ChatMessage, ChatMessages, ChatPrompt

### Component Usage Pattern
1. Check `nuxt-ui.txt` or `https://ui.nuxt.com/raw/components/<component>.md` for API
2. Use Nuxt UI components instead of creating custom ones
3. Follow existing patterns in the codebase
4. Ensure proper TypeScript typing for props and events

## Important Notes

1. **MDC Component**: Always use MDC for markdown rendering, not v-html
2. **Type Imports**: Use `import type` for type-only imports
3. **Error Handling**: Remove unused catch error parameters entirely
4. **Global Types**: Use `server/utils/globalStore.ts` helpers instead of direct global access
5. **Package Manager**: This project uses pnpm, not npm or yarn
6. **Ambient Types**: `.d.ts` files with `declare global` are ambient - don't import directly

## File Structure
```
/
├── app/
│   ├── components/      # Vue components
│   ├── composables/     # Vue composables (LiveKit integration)
│   ├── pages/          # Page components
│   ├── utils/          # Utility functions
│   └── types/          # Client-side types
├── server/
│   ├── api/            # API endpoints (LiveKit token generation)
│   ├── utils/          # Server utilities
│   └── types/          # Server-side types
├── shared/
│   └── types/          # Shared types (client & server)
├── public/
│   └── sounds/         # Audio notification files
├── livekit.txt         # LiveKit documentation
├── nuxt-ui.txt         # Nuxt UI component documentation
└── nuxt.txt           # Nuxt framework documentation
```