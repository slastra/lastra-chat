<script setup lang="ts">
import type { UseLiveKitChatReturn } from '../composables/useLiveKitChat'
import type { UseLiveKitRoomReturn } from '../composables/useLiveKitRoom'
import type { ChatMessage } from '../../shared/types/chat'
import { convertToLegacyFormat } from '../../shared/types/chat'

const liveKitChat = inject('liveKitChat') as UseLiveKitChatReturn
const liveKitRoom = inject('liveKitRoom') as UseLiveKitRoomReturn

// Convert LiveKit messages to legacy ChatMessage format
const messages = computed(() =>
  liveKitChat.messages.value.map(convertToLegacyFormat)
)

// Compute connection status from LiveKit room state
const connectionStatus = computed(() => {
  if (liveKitRoom.isConnected.value) return 'connected'
  if (liveKitRoom.isConnecting.value) return 'connecting'
  return 'disconnected'
})

const messagesContainer = ref<HTMLElement>()

// Filter out empty bot messages (during initial streaming)
const visibleMessages = computed(() =>
  messages.value.filter((m: ChatMessage) => m.type !== 'bot' || m.content.trim().length > 0)
)

// Simple scroll to bottom function
const scrollToBottom = () => {
  if (!messagesContainer.value) return
  // Use setTimeout to ensure DOM is fully updated
  setTimeout(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  }, 100)
}

// Scroll on any message update
watch(visibleMessages, (newMessages, oldMessages) => {
  if (!newMessages.length) return

  // Check if a new message was added
  if (!oldMessages || newMessages.length > oldMessages.length) {
    scrollToBottom()
  }
}, { deep: true })

// Initial scroll on mount
onMounted(() => {
  scrollToBottom()
})
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0">
    <!-- Empty state -->
    <div
      v-if="visibleMessages.length === 0 && connectionStatus !== 'connecting'"
      class="flex flex-col items-center justify-center flex-1 text-muted py-12"
    >
      <UIcon name="i-lucide-message-circle-dashed" class="text-4xl mb-2" />
      <p>Nothin' yet!</p>
    </div>

    <!-- Loading state -->
    <div
      v-else-if="visibleMessages.length === 0 && connectionStatus === 'connecting'"
      class="flex flex-col items-center justify-center flex-1 text-muted"
    >
      <UIcon name="i-lucide-loader-2" class="text-4xl mb-2 animate-spin" />
      <p>Connecting to chat...</p>
    </div>

    <!-- Messages container -->
    <div
      v-else
      ref="messagesContainer"
      class="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
    >
      <TransitionGroup
        name="message"
        tag="div"
        class="space-y-4"
      >
        <ChatMessageItem
          v-for="message in visibleMessages"
          :key="message.id"
          :message="message"
        />
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
/* Message fade-in animation */
.message-enter-active {
  transition: all 0.3s ease-out;
}

.message-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.message-leave-active {
  transition: all 0.2s ease-in;
}

.message-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

/* Smooth animation for messages being pushed down */
.message-move {
  transition: transform 0.3s ease;
}
</style>
