# Project Instructions for Claude Code

## Quick Reference for Documentation Files
- **Use `livekit.txt`** when working with: WebRTC features, video/audio/screen sharing, room management, data channels, AI agents
- **Use `nuxt-ui.txt`** when working with: UI components, forms, dropdowns, buttons, modals, themes, styling
- **Use `nuxt.txt`** when working with: Nuxt configuration, server/client code, plugins, modules, SSR/SSG, routing

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
- Server-side global variables must use the helper functions from `server/utils/globalStore.ts`

### Code Quality
- Always run `pnpm run lint` and `pnpm run typecheck` before considering work complete
- Fix all linting errors - no exceptions
- Prefer editing existing files over creating new ones
- Never create documentation files unless explicitly requested

### Security
- Use MDC component for rendering markdown, not v-html (security requirement)
- Never expose or log secrets, keys, or credentials
- Follow all security best practices

## Documentation Resources

### Available Documentation Files
The project includes comprehensive documentation files for key technologies:

1. **`livekit.txt`** - Complete LiveKit documentation including:
   - WebRTC SFU architecture and room management
   - Client SDK guides for audio, video, screen sharing
   - Data channels and state synchronization
   - AI agents framework and telephony integration
   - Code examples and recipes

2. **`nuxt-ui.txt`** - Nuxt UI v4 component documentation:
   - Complete component API reference
   - Props, slots, and events for all components
   - Theme configuration and styling
   - Migration guides and best practices

3. **`nuxt.txt`** - Nuxt 4 framework documentation:
   - Core concepts and architecture
   - Server/client rendering strategies
   - Module development and plugins
   - Performance optimization techniques

### Using Documentation Resources
When implementing features or debugging:
1. Reference the appropriate `.txt` file for API details
2. Search within files for specific component/feature documentation
3. Use examples from the documentation as implementation guides

## Nuxt UI v4 Component Guide

### Component Version
**Current Version**: Nuxt UI v4.0.0 (stable)

### Accessing Component Documentation
Component documentation is available in `nuxt-ui.txt` or via URL:
```
https://ui.nuxt.com/raw/components/<component-name>.md
```

### Available Components
The following Nuxt UI v4 components are available in this project:

**Layout & Structure:**
- App, Container, Main, Page, PageBody, PageHeader, PageSection, PageAside
- Header, Footer, FooterColumns
- DashboardGroup, DashboardNavbar, DashboardPanel, DashboardResizeHandle
- DashboardSidebar, DashboardSidebarCollapse, DashboardSidebarToggle, DashboardToolbar

**Navigation:**
- Breadcrumb, NavigationMenu, ContentNavigation
- DashboardSearch, DashboardSearchButton, ContentSearch, ContentSearchButton
- Pagination, Stepper, Timeline

**Forms & Inputs:**
- Form, FormField, AuthForm
- Input, InputMenu, InputNumber, InputTags, Textarea
- Select, SelectMenu, RadioGroup
- Checkbox, CheckboxGroup, Switch
- ColorPicker, PinInput, Slider
- FileUploadNew

**Buttons & Actions:**
- Button, ButtonGroup
- ColorModeButton, ColorModeSelect, ColorModeSwitch
- LocaleSelect

**Display Components:**
- Alert, Badge, Banner, Chip, Kbd
- Avatar, AvatarGroup, ColorModeAvatar, User
- Card, PageCard
- Accordion, PageAccordion, Collapsible
- Tabs, Tree

**Content & Typography:**
- BlogPost, BlogPosts
- ChangelogVersion, ChangelogVersions
- PageColumns, PageGrid, PageList
- PageFeature, PageHero, PageCTA
- PageAnchors, PageLinks, PageLogos, PageMarquee
- ContentToc, ContentSurround

**Chat Components:**
- ChatMessage, ChatMessages
- ChatPalette, ChatPrompt, ChatPromptSubmit

**Overlays & Modals:**
- Modal, Drawer, Slideover
- Popover, Tooltip, ContextMenu
- CommandPalette, DropdownMenu

**Data Display:**
- Table, PricingPlan, PricingPlans, PricingTable
- Calendar, Progress, Skeleton
- Carousel

**Utilities:**
- Icon, ColorModeImage
- Link, Separator
- Error, Toast

### Using Components
When implementing UI features, always:
1. Check the component documentation first using the URL pattern above
2. Use the Nuxt UI components instead of creating custom ones
3. Follow the existing patterns in the codebase
4. Ensure proper TypeScript typing for all props and events

## Project-Specific Patterns

### LiveKit Integration
- Uses LiveKit SFU architecture instead of mesh WebRTC
- LiveKit server handles all peer connections and media routing
- Data channels used for chat messaging (reliable) and typing indicators (unreliable)

### LiveKit Composables
- `useLiveKitRoom.ts` - Core room connection, media tracks, participant management
- `useLiveKitChat.ts` - Chat messaging via data channels, typing indicators
- `useLiveKitBots.ts` - AI bot integration with LiveKit data channels
- `useLiveKitChatState.ts` - Bridge for legacy UI component compatibility

### LiveKit Best Practices
- **Video Track Attachment**: Use Vue template refs, not DOM IDs
```typescript
// ✅ Correct - VideoTrack.vue component with refs
<video ref="videoRef" />
const videoRef = ref<HTMLVideoElement>()
track.attach(videoRef.value)

// ❌ Incorrect - DOM ID attachment
track.attach('video-element-id')
```
- **Audio Level Monitoring**: Use `ActiveSpeakersChanged` event, not track-level events
- **Track Lifecycle**: Always clean up track subscriptions on component unmount
- **Connection Quality**: Monitor via `ConnectionQualityChanged` event

### Server-Side Patterns
- Bot state management persists across server restarts using in-memory storage
- Token generation for LiveKit authentication handled server-side
- AI bot responses streamed through data channels for real-time delivery

### Chat Implementation
Uses LiveKit data channels for real-time communication:
- **Reliable channels**: Chat messages, bot responses, system messages
- **Unreliable channels**: Typing indicators, presence updates
- Bridge pattern maintains compatibility with existing UI components

### Key Features
- **Media Device Management**: Dynamic switching of cameras, microphones, and speakers
- **Track Lifecycle**: Proper handling of mute/unmute vs publish/unpublish events
- **Audio Feedback Prevention**: Local audio tracks excluded from playback
- **Connection Resilience**: Automatic reconnection with exponential backoff

### Commands
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

## Nuxt 4 TypeScript Guide

### Current Type Organization
The project is using Nuxt 4.1.0 with TypeScript project references for improved type safety and IntelliSense.

#### Type File Locations (Current - Nuxt 4 Structure ✅)
- `/shared/types/` - Types shared between client and server
  - `webrtc.ts` - WebRTC-related interfaces used by both contexts
  - `index.ts` - Re-exports for convenient imports
- `/server/types/` - Server-side types only
  - `global.d.ts` - Server global type declarations
- `/server/utils/globalStore.ts` - Type-safe server global state accessors
- `/app/types/` - Client-side types (created, empty for future use)

#### TypeScript Configuration
The project uses Nuxt 4's project references in `tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./.nuxt/tsconfig.app.json" },    // App context
    { "path": "./.nuxt/tsconfig.server.json" },  // Server context
    { "path": "./.nuxt/tsconfig.shared.json" },  // Shared context
    { "path": "./.nuxt/tsconfig.node.json" }     // Build-time context
  ]
}
```

Each context has its own TypeScript configuration with appropriate globals and APIs.

#### Server-Side Patterns
- Use environment variables for LiveKit credentials
- Token generation includes proper grants and metadata
- Bot responses processed server-side and sent via data channels
- Persistent bot state management across sessions

#### Type Checking
Current: `pnpm run typecheck`
Future (Nuxt 4 recommended): `vue-tsc -b --noEmit` for better project reference support

## Important Notes

1. **MDC Component**: Always use MDC for markdown rendering, not v-html or other methods
2. **Type Imports**: Use `import type` for type-only imports
3. **Error Handling**: Unused catch error parameters should be removed entirely
4. **Global Types**: Use `server/utils/globalStore.ts` helpers instead of direct global access
5. **Package Manager**: This project uses pnpm, not npm or yarn
6. **Ambient Types**: `.d.ts` files with `declare global` are ambient - don't import them directly

## File Structure
```
/
├── app/
│   ├── components/      # Vue components
│   ├── composables/     # Vue composables
│   ├── pages/          # Page components
│   ├── utils/          # Utility functions
│   └── types/          # Client-side types (empty, for future use)
├── server/
│   ├── api/            # API endpoints
│   ├── utils/          # Server utilities
│   │   └── globalStore.ts  # Type-safe global state accessors
│   └── types/          # Server-side types
│       └── global.d.ts     # Server global type declarations
├── shared/
│   └── types/          # Shared types (client & server)
│       ├── webrtc.ts       # WebRTC interfaces
│       └── index.ts        # Re-exports
└── public/
    └── sounds/         # Audio notification files
```

## LiveKit Integration (Production Ready)

**Status**: The project has successfully migrated from custom WebRTC/WebSocket to LiveKit. All core functionality is stable and optimized. Reference `livekit.txt` for complete LiveKit documentation and implementation guides.

### LiveKit Configuration

#### Environment Variables
```env
LIVEKIT_KEY=devkey        # API key for token generation
LIVEKIT_SECRET=secret     # API secret for token generation
LIVEKIT_URL=ws://localhost:7880  # LiveKit server URL (dev mode)
```

#### Development Setup
1. **Start LiveKit Server**: `livekit-server --dev`
2. **Dashboard**: Available at http://localhost:7880 in dev mode
3. **CLI Tool**: Use `lk` command for room management and testing

### LiveKit Architecture

#### Token Generation
- Tokens are generated server-side using `/server/api/livekit-token.post.ts`
- Include user identity, name, and metadata
- Grant appropriate permissions (publish, subscribe, data channels)

#### Room Management
- Single Room instance per user session
- Automatic reconnection handling
- Adaptive streaming and dynamic broadcasting (dynacast)

#### Data Channels
- **Reliable**: Chat messages, bot responses, system notifications
- **Unreliable**: Typing indicators, ephemeral updates
- 16KB message size limit (chunk larger messages if needed)

### LiveKit Best Practices

1. **Connection Management**
   - Use `prepareConnection()` for faster room joins
   - Set `disconnectOnPageLeave: false` for better UX during navigation
   - Handle reconnection events appropriately

2. **Track Management**
   - Use `enableCameraAndMicrophone()` for initial setup
   - Individual control with `setCameraEnabled()` and `setMicrophoneEnabled()`
   - Always clean up tracks on unmount

3. **Data Channel Messages**
   - Define clear message types and schemas
   - Use JSON for structured data
   - Implement message versioning for compatibility

4. **Error Handling**
   - Listen for `RoomEvent.Disconnected` with error reasons
   - Implement retry logic for token generation
   - Provide user feedback for connection issues

### Recent Improvements

**New Features (Latest Updates):**
- ✅ **Enhanced Screen Sharing**: Multiple quality presets with up to 60 FPS for gaming
  - Gaming Mode: 1080p @ 60 FPS for high-motion content
  - Balanced: 1080p @ 30 FPS (default)
  - Presentation: 1080p @ 15 FPS for static slides
  - Bandwidth Saver: 720p @ 15 FPS
- ✅ **Nuxt UI v4 Migration**: Upgraded from beta to stable v4.0.0
- ✅ **Improved Menu System**: Radio button selection for screen quality options
- ✅ **Persistent Preferences**: Screen share quality saved to localStorage
- ✅ **Fullscreen Video Modal**: Click any video stream to view in fullscreen with automatic quality scaling
- ✅ **Dynamic Video Quality Control**: Uses LiveKit's `setVideoQuality()` API for adaptive quality
- ✅ **ntfy.sh Notifications**: All user messages trigger server notifications (configurable via MY_USERNAME env var)
- ✅ **Sound Notifications**: Audio feedback for messages, AI responses, join/leave events
- ✅ **Improved Media Sync**: Fixed microphone/camera/screen share indicators updating properly across all clients

**Completed Fixes:**
- Fixed Vue reactivity issues with track updates (always create new object references)
- Fixed screen share not appearing on remote clients without refresh
- Fixed microphone icon persistence on remote clients when muted
- Separated camera mute/unmute from screen share publish/unpublish handling
- Fixed duplicate messages being sent to bot context
- Resolved camera track cleanup issues (handle mute events vs unpublish)
- Fixed audio feedback by properly filtering local participant audio
- Corrected device switching to use LiveKit's switchActiveDevice API
- Fixed identity comparison (LiveKit identity vs clientId)
- Resolved all TypeScript and linting errors

**Architecture Improvements:**
- Migrated from custom WebRTC/WebSocket to LiveKit SFU
- Implemented proper track lifecycle management
- Added comprehensive audio level monitoring
- Integrated customizable sound notifications with localStorage persistence