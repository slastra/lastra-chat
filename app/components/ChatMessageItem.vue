<script setup lang="ts">
import type { ChatMessage } from '~/composables/useChatState'
import { useTimeAgo } from '@vueuse/core'

const props = defineProps<{
  message: ChatMessage
}>()

const { clientId } = useUser()

const isOwnMessage = computed(() => props.message.userId === clientId.value)
const isSystemMessage = computed(() => props.message.type === 'system')
const isAIMessage = computed(() => props.message.type === 'ai')

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
      <UAvatar
        :alt="message.userName"
        :icon="isAIMessage ? 'i-lucide-bot' : undefined"
        :label="!isAIMessage ? message.userName.charAt(0).toUpperCase() : undefined"
        size="lg"
        class="mt-5"
      />

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
              ? 'bg-primary text-inverted'
              : isAIMessage
                ? 'bg-accented'
                : 'bg-elevated',
            'prose prose-sm max-w-none prose-p:leading-snug prose-li:leading-snug',
            isOwnMessage ? 'prose-invert' : 'prose-gray dark:prose-invert',
            '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
            '[&_p]:my-1 [&_p]:leading-snug',
            '[&_pre]:bg-black/10 dark:[&_pre]:bg-white/10 [&_pre]:rounded [&_pre]:p-2 [&_pre]:my-2',
            '[&_code]:bg-black/10 dark:[&_code]:bg-white/10 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5',
            '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
            '[&_a]:underline [&_a]:decoration-dotted',
            '[&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1',
            '[&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1',
            '[&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-2',
            '[&_blockquote]:border-gray-300 dark:[&_blockquote]:border-gray-600',
            '[&_h1]:mt-2 [&_h1]:mb-1 [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:mt-2 [&_h3]:mb-1'
          ]"
        >
          <MDC :value="message.content" tag="div" />
        </div>
      </div>
    </div>
  </div>
</template>
