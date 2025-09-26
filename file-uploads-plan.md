# File Upload Implementation Plan for Lastra Chat

## Overview
Implement comprehensive file upload functionality for the chat application with inline display for images, video, and audio, while preserving original filenames for downloads.

## Phase 1: Basic Upload Infrastructure

### 1.1 Create Upload API Endpoint
**File:** `/server/api/upload.post.ts`

```typescript
// Key features:
- Handle multipart/form-data uploads
- Generate unique storage names (UUID-timestamp)
- Store original filename in metadata
- Return file metadata including:
  {
    url: string,          // Public URL for access
    originalName: string, // Original filename for downloads
    mimeType: string,     // For inline display decisions
    size: number,         // File size in bytes
    uploadedAt: string    // ISO timestamp
  }
```

### 1.2 File Storage Structure
```
public/
  uploads/
    2024/
      01/
        {uuid}-{timestamp}.{ext}  // Actual stored file
```

### 1.3 Supported File Types & Limits
- **Images**: `.jpg, .jpeg, .png, .gif, .webp, .svg` (max 10MB)
- **Audio**: `.mp3, .wav, .ogg, .m4a, .webm` (max 25MB)
- **Video**: `.mp4, .webm, .mov` (max 100MB)
- **Documents**: `.pdf, .doc, .docx, .txt, .md` (max 10MB)
- **Archives**: `.zip, .rar, .7z, .tar, .gz` (max 50MB)

## Phase 2: Frontend Upload UI

### 2.1 Create FileUploadButton Component
**File:** `/app/components/FileUploadButton.vue`

```vue
<template>
  <UPopover>
    <UButton icon="i-lucide-paperclip" variant="ghost" />
    <template #content>
      <UFileUpload
        :multiple="true"
        :accept="acceptedTypes"
        @change="handleFileSelect"
      >
        <template #default="{ open }">
          <!-- Custom upload area -->
        </template>
      </UFileUpload>
    </template>
  </UPopover>
</template>
```

### 2.2 Modify ChatInput Component
**File:** `/app/components/ChatInput.vue`

- Add FileUploadButton next to send button
- Show upload progress indicator
- Handle file upload with optional message
- Format uploaded files as special message format

### 2.3 Upload Progress & Preview
- Show selected files before upload
- Display upload progress bar
- Allow removal of files before sending
- Show file type icons for non-previewable files

## Phase 3: Message Format & Storage

### 3.1 Enhanced Message Format
```typescript
interface ChatMessage {
  content: string,
  attachments?: Array<{
    url: string,
    originalName: string,
    mimeType: string,
    size: number,
    type: 'image' | 'video' | 'audio' | 'document' | 'archive'
  }>
}
```

### 3.2 Message Sending Format
```typescript
// For LiveKit data channel
{
  type: 'message',
  content: 'Check out these files!',
  attachments: [
    {
      url: '/uploads/2024/01/abc123.jpg',
      originalName: 'vacation-photo.jpg',
      mimeType: 'image/jpeg',
      size: 2048000,
      type: 'image'
    }
  ]
}
```

## Phase 4: Inline Display Components

### 4.1 Create AttachmentRenderer Component
**File:** `/app/components/AttachmentRenderer.vue`

```vue
<template>
  <div class="attachments-container">
    <div v-for="attachment in attachments" :key="attachment.url">
      <!-- Image Display -->
      <div v-if="attachment.type === 'image'" class="inline-image">
        <img
          :src="attachment.url"
          :alt="attachment.originalName"
          @click="openFullscreen"
          class="max-w-md rounded cursor-pointer"
        />
        <a :href="attachment.url" :download="attachment.originalName">
          {{ attachment.originalName }}
        </a>
      </div>

      <!-- Video Display -->
      <div v-if="attachment.type === 'video'" class="inline-video">
        <video
          controls
          :src="attachment.url"
          class="max-w-lg rounded"
        >
          <source :src="attachment.url" :type="attachment.mimeType">
        </video>
        <a :href="attachment.url" :download="attachment.originalName">
          {{ attachment.originalName }}
        </a>
      </div>

      <!-- Audio Display -->
      <div v-if="attachment.type === 'audio'" class="inline-audio">
        <audio controls :src="attachment.url" class="w-full max-w-md">
          <source :src="attachment.url" :type="attachment.mimeType">
        </audio>
        <a :href="attachment.url" :download="attachment.originalName">
          {{ attachment.originalName }}
        </a>
      </div>

      <!-- Document/Archive Display -->
      <div v-if="['document', 'archive'].includes(attachment.type)" class="file-link">
        <UButton
          :icon="getFileIcon(attachment.type)"
          :label="attachment.originalName"
          :href="attachment.url"
          :download="attachment.originalName"
          variant="soft"
        />
        <span class="text-xs">{{ formatFileSize(attachment.size) }}</span>
      </div>
    </div>
  </div>
</template>
```

### 4.2 Update ChatMessageItem Component
- Detect attachments in messages
- Render AttachmentRenderer for messages with files
- Support mixed content (text + attachments)

## Phase 5: Advanced Features

### 5.1 Image Features
- Lazy loading for performance
- Thumbnail generation (server-side)
- Click to view fullscreen modal
- Image gallery for multiple images

### 5.2 Video Features
- Poster frame extraction
- Responsive video player
- Fullscreen support
- Playback controls

### 5.3 Audio Features
- Waveform visualization (optional)
- Playback speed controls
- Volume normalization

### 5.4 Document Features
- PDF preview (first page)
- File type icons
- Quick download button
- File size display

## Phase 6: Download Handling

### 6.1 Preserve Original Filenames
```typescript
// Server endpoint for proper download headers
// /server/api/download/[...path].get.ts
export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, 'path')
  const originalName = getQuery(event).name

  setHeader(event, 'Content-Disposition',
    `attachment; filename="${originalName}"`)

  return sendStream(event, createReadStream(filePath))
})
```

### 6.2 Download Button Component
```vue
<UButton
  :href="`/api/download/${attachment.url}?name=${attachment.originalName}`"
  icon="i-lucide-download"
  size="xs"
/>
```

## Phase 7: Security & Optimization

### 7.1 Security Measures
- File type validation (MIME type checking)
- Virus scanning (optional, using ClamAV)
- Rate limiting per user
- Maximum storage quota per user
- Sanitize filenames for storage
- Prevent directory traversal attacks

### 7.2 Performance Optimization
- Compress images on upload (optional)
- Generate thumbnails for large images
- Lazy load attachments
- CDN integration (optional)
- Clean up old files (cron job)

### 7.3 Error Handling
- Upload failure recovery
- Network interruption handling
- File too large warnings
- Unsupported file type messages

## Implementation Order

### Week 1: Foundation
1. Create upload API endpoint (Phase 1.1)
2. Implement FileUploadButton component (Phase 2.1)
3. Integrate with ChatInput (Phase 2.2)
4. Basic file upload working

### Week 2: Display & UX
1. Create AttachmentRenderer component (Phase 4.1)
2. Update ChatMessageItem (Phase 4.2)
3. Implement inline image display
4. Add download functionality with original names

### Week 3: Media Support
1. Implement video player inline
2. Implement audio player inline
3. Add document/archive display
4. Test with various file types

### Week 4: Polish & Security
1. Add security validations
2. Implement error handling
3. Add upload progress indicators
4. Performance optimizations

## Technical Considerations

### LiveKit Data Channel Limits
- Maximum message size: 16KB
- Solution: Send file metadata only, not file content
- Files served directly from server

### Storage Management
- Consider implementing file expiry (30-90 days)
- Monitor disk usage
- Implement user quotas
- Consider cloud storage migration path (S3, Cloudflare R2)

### Browser Compatibility
- Test file upload on mobile browsers
- Ensure download works on all platforms
- Fallback for unsupported media formats

## Success Metrics
- Files upload successfully 99%+ of the time
- Inline media displays properly
- Original filenames preserved on download
- No security vulnerabilities
- Performance remains smooth with many attachments

## Future Enhancements
- Drag & drop file upload
- Paste image from clipboard
- File sharing permissions
- Collaborative document editing
- Integration with cloud storage services
- Real-time collaborative viewing (screen share alternative)
- File search functionality
- Automatic file expiration policies