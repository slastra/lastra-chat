<script setup lang="ts">
const { onlineUsers } = useChatState()
const { clientId } = useUser()
const { bots, toggleBot, isBotEnabled } = useBots()

const sortedUsers = computed(() =>
  [...onlineUsers.value]
    .filter(user => !user.userId?.startsWith('ai-')) // Filter out bots
    .sort((a, b) =>
      a.userName.localeCompare(b.userName)
    )
)
</script>

<template>
  <div class="h-full w-full overflow-y-auto p-2">
    <div class="space-y-1 w-full">
      <div
        v-for="user in sortedUsers"
        :key="user.userId"
        class="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <UUser
          :name="user.userName"
          :description="user.isTyping ? 'typing...' : user.userId === clientId ? 'You' : user.userId?.startsWith('ai-') ? 'AI Assistant' : 'Active now'"
          :avatar="user.userId?.startsWith('ai-') ? {
            icon: 'i-lucide-bot'
          } : {
            text: user.userName.charAt(0).toUpperCase()
          }"
          size="sm"
        >
          <template #badge>
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
          </template>
        </UUser>
      </div>

      <div v-if="onlineUsers.length === 0" class="text-center py-8 text-sm text-neutral-500">
        No users online
      </div>

      <!-- Bot Management Section -->
      <div v-if="bots.length > 0" class="">
        <div class="space-y-1">
          <div
            v-for="bot in bots"
            :key="bot.name"
            class="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex items-center justify-between"
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
