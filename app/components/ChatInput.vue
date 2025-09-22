<script setup lang="ts">
// Inject the chat instance from parent
const chat = inject('chat') as ReturnType<typeof useChat>
const { sendMessage, sendTypingIndicator } = chat
const { typingUsers, onlineUsers, connectionStatus } = useChatState()
const { clientId } = useUser()
const { detectBotMention } = useBots()
const { isCommand, executeCommand, getCommandSuggestions } = useSlashCommands()
const { canPlayAudio, enableAudio } = useSoundManager()

const input = ref('')
const isTyping = ref(false)
let typingTimer: NodeJS.Timeout | null = null

const typingUsersList = computed(() => {
  const users = Array.from(typingUsers.value)
    .filter(id => id !== clientId.value)
    .map(id => onlineUsers.value.find(u => u.userId === id)?.userName)
    .filter(Boolean)

  if (users.length === 0) return ''
  if (users.length === 1) return `${users[0]} is typing...`
  if (users.length === 2) return `${users[0]} and ${users[1]} are typing...`
  return `${users.slice(0, -1).join(', ')} and ${users[users.length - 1]} are typing...`
})

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
    await sendMessage(message)
  }
}

const mentionedBot = computed(() => {
  return detectBotMention(input.value)
})

const commandSuggestions = computed(() => {
  return getCommandSuggestions(input.value)
})

const chatStatus = computed(() => {
  if (connectionStatus.value === 'connecting') return 'loading'
  return 'ready'
})
</script>

<template>
  <UChatPrompt
    v-model="input"
    :error="null"
    variant="subtle"
    class="[view-transition-name:chat-prompt] rounded-b-none z-10"
    placeholder="Type a message... "
    @input="handleInput"
    @submit="handleSubmit"
  >
    <UChatPromptSubmit :status="chatStatus" />

    <template v-if="typingUsersList" #leading>
      <div class="text-xs italic text-neutral-500">
        {{ typingUsersList }}
      </div>
    </template>

    <template v-if="commandSuggestions.length > 0" #trailing>
      <div class="text-xs text-primary-500">
        <span v-for="(cmd, index) in commandSuggestions.slice(0, 3)" :key="cmd.name">
          <span v-if="index > 0" class="text-neutral-400"> • </span>
          /{{ cmd.name }}
        </span>
      </div>
    </template>
    <template v-else-if="mentionedBot" #trailing>
      <div class="text-xs text-blue-500">
        {{ mentionedBot?.name }} is listening...
      </div>
    </template>
  </UChatPrompt>
</template>
