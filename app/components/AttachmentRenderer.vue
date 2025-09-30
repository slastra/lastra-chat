<script setup lang="ts">
interface FileAttachment {
  url: string
  originalName: string
  mimeType: string
  size: number
  type: 'image' | 'video' | 'audio' | 'document' | 'archive'
  uploadedAt: string
}

const props = defineProps<{
  attachments: FileAttachment[]
}>()

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const getFileIcon = (type: string, mimeType: string): string => {
  switch (type) {
    case 'image':
      return 'i-lucide-image'
    case 'video':
      return 'i-lucide-video'
    case 'audio':
      return 'i-lucide-music'
    case 'document':
      if (mimeType === 'application/pdf') return 'i-lucide-file-text'
      if (mimeType.includes('word') || mimeType.includes('document')) return 'i-lucide-file-type'
      if (mimeType === 'text/plain') return 'i-lucide-file-text'
      if (mimeType === 'text/markdown') return 'i-lucide-file-code'
      return 'i-lucide-file-text'
    case 'archive':
      return 'i-lucide-archive'
    default:
      return 'i-lucide-file'
  }
}

const getFileTypeColor = (type: string, mimeType: string): string => {
  switch (type) {
    case 'document':
      if (mimeType === 'application/pdf') return 'text-red-500'
      if (mimeType.includes('word')) return 'text-blue-500'
      if (mimeType === 'text/plain') return 'text-gray-500'
      if (mimeType === 'text/markdown') return 'text-green-500'
      return 'text-muted'
    case 'archive':
      return 'text-orange-500'
    default:
      return 'text-muted'
  }
}

const getFileTypeBadge = (mimeType: string): string => {
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType.includes('word')) return 'DOC'
  if (mimeType === 'text/plain') return 'TXT'
  if (mimeType === 'text/markdown') return 'MD'
  if (mimeType === 'application/zip') return 'ZIP'
  if (mimeType.includes('rar')) return 'RAR'
  if (mimeType.includes('7z')) return '7Z'
  return mimeType.split('/')[1]?.toUpperCase() || 'FILE'
}

const downloadFile = async (attachment: FileAttachment) => {
  try {
    // Use fetch to trigger download
    const downloadUrl = `/api/download${attachment.url}?name=${encodeURIComponent(attachment.originalName)}`

    const response = await fetch(downloadUrl)

    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`)
    }

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = attachment.originalName
    document.body.appendChild(link)
    link.click()

    // Clean up
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Download failed:', error)
    // Fallback to direct link
    window.open(`/api/download${attachment.url}?name=${encodeURIComponent(attachment.originalName)}`, '_blank')
  }
}
</script>

<template>
  <div v-if="props.attachments.length > 0" class="space-y-3 mt-2">
    <div
      v-for="attachment in props.attachments"
      :key="attachment.url"
      class="attachment-item"
    >
      <!-- Image Display -->
      <div v-if="attachment.type === 'image'" class="space-y-2">
        <div class="relative group">
          <img
            :src="`/api/download/${attachment.url}?name=${encodeURIComponent(attachment.originalName)}`"
            :alt="attachment.originalName"
            class="max-w-sm max-h-64 rounded cursor-pointer object-cover transition-transform hover:scale-101"
            loading="lazy"
            @click="downloadFile(attachment)"
          >
          <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded flex items-center justify-center pointer-events-none">
            <UIcon
              name="i-lucide-download"
              class="text-white opacity-0 group-hover:opacity-100 transition-opacity"
              size="24"
            />
          </div>
        </div>
        <div class="flex items-center justify-between">
          <div class="flex-1 min-w-0">
            <span class="text-sm text-muted truncate block">{{ attachment.originalName }}</span>
            <span class="text-xs text-dimmed">{{ formatFileSize(attachment.size) }}</span>
          </div>
        </div>
      </div>

      <!-- Video Display -->
      <div v-else-if="attachment.type === 'video'" class="space-y-2">
        <div class="relative group">
          <video
            controls
            preload="metadata"
            :src="`/api/download/${attachment.url}`"
            class="max-w-lg max-h-64 rounded"
          >
            <source :src="`/api/download/${attachment.url}`" :type="attachment.mimeType">
            Your browser does not support the video tag.
          </video>
        </div>
        <div class="flex items-center justify-between">
          <div class="flex-1 min-w-0">
            <span class="text-sm text-muted truncate block">{{ attachment.originalName }}</span>
            <span class="text-xs text-dimmed">{{ formatFileSize(attachment.size) }}</span>
          </div>
        </div>
      </div>

      <!-- Audio Display -->
      <div v-else-if="attachment.type === 'audio'" class="space-y-2">
        <audio
          controls
          preload="metadata"
          :src="`/api/download/${attachment.url}`"
          class="rounded"
          style="width: 400px;"
        >
          <source :src="`/api/download/${attachment.url}`" :type="attachment.mimeType">
          Your browser does not support the audio tag.
        </audio>
        <div class="flex items-center justify-between">
          <div class="flex-1 min-w-0">
            <span class="text-sm text-muted truncate block">{{ attachment.originalName }}</span>
            <span class="text-xs text-dimmed">{{ formatFileSize(attachment.size) }}</span>
          </div>
        </div>
      </div>

      <!-- Document/Archive Display -->
      <div
        v-else
        class="border border-muted rounded-lg p-4 bg-elevated hover:bg-accented transition-colors cursor-pointer"
        @click="downloadFile(attachment)"
      >
        <div class="flex items-center gap-3">
          <div class="relative">
            <UIcon
              :name="getFileIcon(attachment.type, attachment.mimeType)"
              :class="getFileTypeColor(attachment.type, attachment.mimeType)"
              size="28"
            />
            <UBadge
              :label="getFileTypeBadge(attachment.mimeType)"
              size="xs"
              variant="solid"
              class="absolute -top-1 -right-1"
            />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">
              {{ attachment.originalName }}
            </p>
            <div class="flex items-center gap-2 mt-1">
              <p class="text-xs text-muted">
                {{ formatFileSize(attachment.size) }}
              </p>
              <span class="text-xs text-dimmed">•</span>
              <UBadge
                :label="getFileTypeBadge(attachment.mimeType)"
                size="xs"
                variant="soft"
                color="neutral"
              />
            </div>
          </div>
          <UIcon
            name="i-lucide-download"
            size="20"
            class="text-muted"
          />
        </div>
      </div>
    </div>
  </div>
</template>
