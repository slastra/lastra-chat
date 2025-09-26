<script setup lang="ts">
import type { UseLiveKitChatReturn } from '../composables/useLiveKitChat'
import type { UseLiveKitRoomReturn } from '../composables/useLiveKitRoom'

interface FileUpload {
  url: string
  originalName: string
  mimeType: string
  size: number
  type: string
  uploadedAt: string
}

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

const sendMessageWithAttachments = async (message: string, attachments?: FileUpload[]) => {
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
    return
  }

  // Create message data with attachments
  const messageData = {
    type: 'message',
    content: message,
    attachments: attachments || []
  }

  // Check if this message should trigger a bot BEFORE sending
  const botPromise = liveKitBots?.checkOutgoingMessage
    ? liveKitBots.checkOutgoingMessage(message, liveKitRoom.roomName)
    : Promise.resolve()

  // Send the message with attachments through LiveKit data channel
  if (attachments && attachments.length > 0) {
    // Send as JSON string for messages with attachments
    await sendMessage(JSON.stringify(messageData))
  } else {
    // Send as plain text for simple messages
    await sendMessage(message)
  }

  // Wait for bot check to complete
  await botPromise
}

const handleSubmit = async () => {
  if (!input.value.trim()) return

  const message = input.value
  input.value = ''

  await sendMessageWithAttachments(message)
}

const handleFilesUploaded = async (files: FileUpload[]) => {
  const message = input.value.trim()
  input.value = ''

  await sendMessageWithAttachments(message, files)
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
    <template #default>
      <div class="flex items-center gap-1">
        <FileUploadButton @files-uploaded="handleFilesUploaded" />
        <UChatPromptSubmit :status="chatStatus as any" />
      </div>
    </template>
  </UChatPrompt>
</template>
