<script setup lang="ts">
const { messages, connectionStatus } = useChatState()
const messagesContainer = ref<HTMLElement>()

// Filter out empty AI messages (during initial streaming)
const visibleMessages = computed(() =>
  messages.value.filter(m => m.type !== 'ai' || m.content.trim().length > 0)
)

// Simple scroll to bottom function
const scrollToBottom = () => {
  if (!messagesContainer.value) return
  messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
}

// Scroll on any message update
watchEffect(() => {
  // This will trigger on any change to messages (new messages or content updates)
  if (visibleMessages.value.length > 0) {
    nextTick(() => scrollToBottom())
  }
})

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
      <UIcon name="i-lucide-message-circle" class="text-4xl mb-2" />
      <p>No messages yet. Start the conversation!</p>
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
