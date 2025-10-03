<script setup lang="ts">
import type { UseLiveKitRoomReturn } from '../composables/useLiveKitRoom'
import type { UseLiveKitChatReturn } from '../composables/useLiveKitChat'

const liveKitRoom = inject('liveKitRoom') as UseLiveKitRoomReturn
const liveKitChat = inject('liveKitChat') as UseLiveKitChatReturn
const { bots, toggleBot, isBotEnabled } = useBots()

// Generate avatars for users
const getUserAvatar = (userName: string, isBot: boolean) => {
  if (isBot) {
    return { icon: 'i-lucide-bot' }
  }
  const avatarUrl = useDiceBearAvatar(userName)
  return { src: avatarUrl.value }
}

const sortedUsers = computed(() => {
  const users = []

  // Add local participant
  if (liveKitRoom?.localParticipant.value) {
    users.push(liveKitRoom.localParticipant.value)
  }

  // Add remote participants
  if (liveKitRoom?.remoteParticipants.value) {
    users.push(...liveKitRoom.remoteParticipants.value)
  }

  return users
    .filter(user => !user.identity?.startsWith('ai-')) // Filter out bots
    .map(user => ({
      userId: user.identity,
      userName: user.name || user.identity,
      mediaState: {
        webcam: user.isCameraEnabled,
        microphone: user.isMicrophoneEnabled,
        screen: user.isScreenShareEnabled
      },
      isTyping: liveKitChat?.typingUsers.value?.includes(user.name || user.identity) || false
    }))
    .sort((a, b) => a.userName.localeCompare(b.userName))
})
</script>

<template>
  <div class="h-full w-full ">
    <div class="space-y-2 w-full">
      <div
        v-for="user in sortedUsers"
        :key="user.userId"
        class="border rounded-lg border-accented bg-default/50 p-2"
      >
        <div class="flex items-center justify-between">
          <UUser
            :name="user.userName"
            :description="
              user.isTyping
                ? 'typing...'
                : user.userId === liveKitRoom?.localParticipant.value?.identity
                  ? 'You'
                  : user.userId?.startsWith('ai-')
                    ? 'AI Assistant'
                    : 'Active now'
            "
            :avatar="getUserAvatar(user.userName, user.userId?.startsWith('ai-') || false)"
            size="sm"
          />

          <!-- Media Status Indicators -->
          <div class="flex items-center gap-1">
            <UIcon
              v-if="user.mediaState?.webcam"
              name="i-lucide-webcam"
              class="text-muted"
            />
            <UIcon
              v-if="user.mediaState?.microphone"
              name="i-lucide-mic"
              class="text-muted"
            />
            <UIcon
              v-if="user.mediaState?.screen"
              name="i-lucide-screen-share"
              class="text-muted"
            />
          </div>
        </div>
      </div>

      <div
        v-if="sortedUsers.length === 0"
        class="text-center py-8 text-sm text-neutral-500"
      >
        No users online
      </div>
      <USeparator class="my-4" />
      <!-- Bot Management Section -->
      <div v-if="bots.length > 0" class="">
        <div class="space-y-4">
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
