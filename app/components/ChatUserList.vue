<script setup lang="ts">
const { onlineUsers, getUserStreams } = useChatState()
const { clientId } = useUser()
const { bots, toggleBot, isBotEnabled } = useBots()

// Access peer manager for connection states
const ws = inject('chat') as ReturnType<typeof useChat>
const mediaStream = useMediaStream(ws)
const peerManager = mediaStream.peerManager

const sortedUsers = computed(() =>
  [...onlineUsers.value]
    .filter(user => !user.userId?.startsWith('ai-')) // Filter out bots
    .sort((a, b) => a.userName.localeCompare(b.userName))
)

// Get connection state for a user and stream type
const getConnectionState = (userId: string, streamType: 'webcam' | 'desktop') => {
  if (userId === clientId.value) return 'self'
  return peerManager.getConnectionState(userId, streamType)
}

// Get connection state color
const getStateColor = (state: string) => {
  switch (state) {
    case 'connected': return 'success'
    case 'connecting': case 'offering': case 'answering': return 'warning'
    case 'failed': return 'error'
    case 'self': return 'info'
    default: return 'neutral'
  }
}
</script>

<template>
  <div class="h-full w-full overflow-y-auto ">
    <div class="space-y-2 w-full">
      <div
        v-for="user in sortedUsers"
        :key="user.userId"
        class="space-y-2 border rounded-lg border-accented p-2 "
      >
        <div class="flex items-center justify-between">
          <UUser
            :name="user.userName"
            :description="
              user.isTyping
                ? 'typing...'
                : user.userId === clientId
                  ? 'You'
                  : user.userId?.startsWith('ai-')
                    ? 'AI Assistant'
                    : 'Active now'
            "
            :avatar="
              user.userId?.startsWith('ai-')
                ? {
                  icon: 'i-lucide-bot'
                }
                : {
                  text: user.userName.charAt(0).toUpperCase()
                }
            "
            size="sm"
          />
        </div>

        <!-- Connection States -->
        <div v-if="user.userId !== clientId" class="flex gap-2 text-xs">
          <UBadge
            :label="`Webcam: ${getConnectionState(user.userId, 'webcam')}`"
            :color="getStateColor(getConnectionState(user.userId, 'webcam'))"
            variant="subtle"
            size="xs"
          />
          <UBadge
            :label="`Screen: ${getConnectionState(user.userId, 'desktop')}`"
            :color="getStateColor(getConnectionState(user.userId, 'desktop'))"
            variant="subtle"
            size="xs"
          />
        </div>

        <!-- Video streams for this user -->
        <div
          v-for="stream in getUserStreams(user.userId)"
          :key="`${user.userId}-${stream.type}`"
          class=""
        >
          <UserVideoStream
            :user-id="user.userId"
            :user-name="user.userName"
            :stream="stream.stream"
            :stream-type="stream.type"
          />
        </div>
      </div>

      <div
        v-if="onlineUsers.length === 0"
        class="text-center py-8 text-sm text-neutral-500"
      >
        No users online
      </div>
      <USeparator class="my-4" />
      <!-- Bot Management Section -->
      <div v-if="bots.length > 0" class="">
        <div class="space-y-1">
          <div
            v-for="bot in bots"
            :key="bot.name"
            class="flex items-center justify-between"
          >
            <UUser
              :name="bot.name"
              :description="bot.role"
              :avatar="{
                icon: 'i-lucide-bot'
              }"
              size="sm"
            />
            <USwitch
              :model-value="isBotEnabled(bot.name)"
              size="sm"
              @update:model-value="toggleBot(bot.name)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
