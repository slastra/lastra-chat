<script setup lang="ts">
import type { ChatMessage } from '../../shared/types/chat'
import { useTimeAgo } from '@vueuse/core'

interface FileAttachment {
  url: string
  originalName: string
  mimeType: string
  size: number
  type: 'image' | 'video' | 'audio' | 'document' | 'archive'
  uploadedAt: string
}

interface MessageWithAttachments {
  type: 'message'
  content: string
  attachments: FileAttachment[]
}

const props = defineProps<{
  message: ChatMessage
}>()

const { clientId } = useUser()

const isOwnMessage = computed(() => props.message.userId === clientId.value)
const isSystemMessage = computed(() => props.message.type === 'system')
const isAIMessage = computed(() => props.message.type === 'bot')

// Use timeAgo for relative time display
const timeAgo = useTimeAgo(props.message.timestamp)

// Keep the exact time for tooltip
const exactTime = computed(() => {
  const date = new Date(props.message.timestamp)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
})

// Parse message content to detect attachments
const parsedMessage = computed(() => {
  try {
    // Try to parse as JSON (messages with attachments)
    const parsed = JSON.parse(props.message.content) as MessageWithAttachments
    if (parsed.type === 'message' && parsed.attachments) {
      return {
        content: parsed.content || '',
        attachments: parsed.attachments
      }
    }
  } catch {
    // Not JSON, treat as plain text
  }

  return {
    content: props.message.content,
    attachments: []
  }
})

const hasAttachments = computed(() => parsedMessage.value.attachments.length > 0)

// DiceBear avatar for user messages
const userAvatarUrl = useDiceBearAvatar(props.message.userName)
</script>

<template>
  <!-- System message -->
  <div v-if="isSystemMessage" class="my-4">
    <USeparator
      size="xs"
      type="dotted"
      :ui="{ label: 'text-xs text-dimmed' }"
      :label="`${message.content} ${timeAgo}.`"
    />
  </div>

  <!-- Regular message -->
  <div
    v-else
    :class="[
      'flex gap-3',
      isOwnMessage ? 'justify-end' : 'justify-start'
    ]"
  >
    <div :class="['flex gap-3 max-w-[70%]', isOwnMessage ? 'flex-row-reverse' : 'flex-row']">
      <!-- Avatar -->
      <div v-if="isAIMessage" class="mt-5 shrink-0">
        <UAvatar
          :alt="message.userName"
          icon="i-lucide-bot"
          size="lg"
        />
      </div>
      <div v-else class="mt-5 shrink-0">
        <img
          :src="userAvatarUrl"
          :alt="message.userName"
          class="w-10 h-10 rounded-full"
        >
      </div>

      <!-- Message content -->
      <div :class="['flex flex-col gap-1', isOwnMessage ? 'items-end' : 'items-start']">
        <!-- Header with name and time -->
        <div class="flex items-center gap-2 text-xs text-muted px-1">
          <span class="font-medium">{{ message.userName }}</span>
          <UTooltip :text="exactTime">
            <span class="cursor-default text-dimmed">{{ timeAgo }}</span>
          </UTooltip>
        </div>

        <!-- Message bubble -->
        <div
          :class="[
            'px-3 py-2 rounded-lg text-sm break-words',
            isOwnMessage
              ? 'bg-inverted text-inverted'
              : isAIMessage
                ? 'bg-accented'
                : 'bg-elevated',
            'prose prose-sm max-w-none',
            isOwnMessage ? 'prose-invert' : '',
            // Prose text colors - use inverted for own messages
            isOwnMessage
              ? '[&_p]:text-inverted [&_li]:text-inverted [&_h1]:text-inverted [&_h2]:text-inverted [&_h3]:text-inverted [&_strong]:text-inverted [&_em]:text-inverted/80'
              : '[&_p]:text-default [&_li]:text-default [&_h1]:text-emphasized [&_h2]:text-emphasized [&_h3]:text-emphasized [&_strong]:text-emphasized [&_em]:text-muted',
            // Spacing
            '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
            '[&_p]:my-1 [&_p]:leading-snug',
            '[&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:mt-2 [&_h3]:mb-1',
            // Code blocks - inverted styles for own messages
            isOwnMessage
              ? '[&_pre]:bg-inverted/10 [&_pre]:border [&_pre]:border-inverted/20 [&_pre]:rounded [&_pre]:p-2 [&_pre]:my-2'
              : '[&_pre]:bg-accented [&_pre]:border [&_pre]:border-accented [&_pre]:rounded [&_pre]:p-2 [&_pre]:my-2',
            isOwnMessage
              ? '[&_code]:bg-inverted/10 [&_code]:text-inverted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5'
              : '[&_code]:bg-accented [&_code]:text-default [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5',
            '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
            // Links - adjust for inverted background
            isOwnMessage
              ? '[&_a]:text-inverted [&_a]:underline [&_a]:decoration-dotted [&_a:hover]:decoration-solid'
              : '[&_a]:text-primary [&_a]:underline [&_a]:decoration-dotted [&_a:hover]:decoration-solid',
            // Lists
            '[&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1',
            '[&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1',
            '[&_li]:leading-snug',
            // Blockquotes - adjust for inverted background
            '[&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-2',
            isOwnMessage
              ? '[&_blockquote]:border-inverted/30 [&_blockquote]:text-inverted/80'
              : '[&_blockquote]:border-accented [&_blockquote]:text-muted'
          ]"
        >
          <!-- Text content (if any) -->
          <MDC v-if="parsedMessage.content.trim()" :value="parsedMessage.content" />

          <!-- File attachments -->
          <AttachmentRenderer
            v-if="hasAttachments"
            :attachments="parsedMessage.attachments"
          />
        </div>
      </div>
    </div>
  </div>
</template>
