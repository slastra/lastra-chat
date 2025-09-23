<script setup lang="ts">
import type { UseLiveKitChatReturn } from '../composables/useLiveKitChat'
import type { UseLiveKitRoomReturn } from '../composables/useLiveKitRoom'

// Inject LiveKit instances
const liveKitChat = inject('liveKitChat') as UseLiveKitChatReturn
const liveKitRoom = inject('liveKitRoom') as UseLiveKitRoomReturn
const liveKitBots = inject('liveKitBots') as { checkOutgoingMessage?: (content: string, roomName: string) => Promise<void> }

// Use LiveKit bridge for compatibility
const chatState = useLiveKitChatState(liveKitChat, liveKitRoom)
const { connectionStatus } = chatState

// Use LiveKit chat methods
const sendMessage = liveKitChat.sendMessage
const sendTypingIndicator = liveKitChat.sendTypingIndicator

const { isCommand, executeCommand } = useSlashCommands()
const { canPlayAudio, enableAudio } = useSoundManager()

const input = ref('')
const isTyping = ref(false)
let typingTimer: NodeJS.Timeout | null = null

const handleInput = () => {
  // Try to enable audio on first user interaction
  if (!canPlayAudio.value) {
    enableAudio().catch(() => {})
  }

  if (!isTyping.value && input.value.trim()) {
    isTyping.value = true
    sendTypingIndicator(true)
  }

  if (typingTimer) {
    clearTimeout(typingTimer)
  }

  typingTimer = setTimeout(() => {
    if (isTyping.value) {
      isTyping.value = false
      sendTypingIndicator(false)
    }
  }, 1000)
}

const handleSubmit = async () => {
  if (!input.value.trim()) return

  const message = input.value
  input.value = ''

  if (isTyping.value) {
    isTyping.value = false
    sendTypingIndicator(false)
  }

  if (typingTimer) {
    clearTimeout(typingTimer)
    typingTimer = null
  }

  // Check if it's a slash command
  if (isCommand(message)) {
    await executeCommand(message)
  } else {
    // Check if this message should trigger a bot BEFORE sending
    // This way the bot gets the context without the current message
    const botPromise = liveKitBots?.checkOutgoingMessage
      ? liveKitBots.checkOutgoingMessage(message, liveKitRoom.roomName)
      : Promise.resolve()

    // Send the user's message
    await sendMessage(message)

    // Wait for bot check to complete
    await botPromise
  }
}

const chatStatus = computed(() => {
  if (connectionStatus.value === 'connecting') return 'loading'
  return 'ready'
})
</script>

<template>
  <UChatPrompt
    v-model="input"
    :error="undefined"
    variant="subtle"
    class="[view-transition-name:chat-prompt] rounded-b-none z-10"
    placeholder="Type a message... "
    @input="handleInput"
    @submit="handleSubmit"
  >
    <UChatPromptSubmit :status="chatStatus as any" />
  </UChatPrompt>
</template>
