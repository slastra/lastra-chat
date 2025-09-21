# Project Instructions for Claude Code

## Project Overview
This is a Nuxt 3 chat application with WebRTC capabilities for screen sharing and video conferencing. The project uses TypeScript, Vue 3 Composition API, and Nuxt UI v3 components.

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

## Nuxt UI v3 Component Guide

### Accessing Component Documentation
Component documentation and examples can be accessed using this URL pattern:
```
https://ui.nuxt.com/raw/components/<component-name>.md
```

For theme documentation:
```
https://ui.nuxt.com/raw/getting-started/theme.md
```

### Available Components
The following Nuxt UI v3 components are available in this project:

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

### WebRTC & TURN Server
- TURN server is configured at `turn.lastra.us` on port 5349 (TLS)
- Uses HMAC-SHA1 authentication with static auth secret
- Test pages available at `/turn-test`, `/display-test`, `/webcam-test`

### Server-Side Global State
Server API endpoints use global variables for state management:
```typescript
const activeRooms = global.screenShareTestRooms || new Map<string, Set<string>>()
if (!global.screenShareTestRooms) {
  global.screenShareTestRooms = activeRooms
}
```

### SSE Implementation
Uses VueUse's `useEventSource` for Server-Sent Events:
- Main chat SSE composable: `composables/useChatSSE.ts`
- Avoid watchEffect when possible - use targeted event listeners

### Testing Commands
```bash
# Type checking
pnpm run typecheck

# Linting
pnpm run lint

# Development server
pnpm run dev

# Build
pnpm run build
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

#### Server-Side Global State Pattern
For server-side global state, use the type-safe helper functions from `server/utils/globalStore.ts`:
```typescript
import { getScreenShareTestRooms, getScreenShareTestQueues } from '../../utils/globalStore'

const activeRooms = getScreenShareTestRooms()
const messageQueues = getScreenShareTestQueues()
```

The global types are defined in `/server/types/global.d.ts` and the helper functions automatically handle initialization.

**DO NOT** directly access `global` variables or import `.d.ts` files in server code (causes Rollup build errors).

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