<script setup lang="ts">
const chat = useChat()
const { loadBots } = useBots()
const isReady = ref(false)

onMounted(async () => {
  // Load bots first
  await loadBots()
  isReady.value = chat.initialize()
})

onUnmounted(() => {
  chat.cleanup()
})
</script>

<template>
  <UDashboardGroup v-if="isReady">
    <UDashboardSidebar
      resizable
      :min-size="22"
      :default-size="22"
      :max-size="40"
      mode="slideover"
      class="bg-elevated/50"
    >
      <template #header>
        <div class="flex items-center justify-between w-full p-4 gap-2">
          <h3 class="font-semibold ">
            Online Users
          </h3>
          <UBadge
            :label="String(chat.onlineUsers.value.length)"
            color="success"
            variant="subtle"
          />
        </div>
      </template>

      <div class="flex-1 min-h-0 w-full">
        <ChatUserList />
      </div>

      <template #footer>
        <div class="w-full p-4">
          <div class="flex items-center gap-2 text-sm">
            <UIcon name="i-lucide-user" class="w-4 h-4" />
            <span class="font-medium">{{ chat.userName.value }}</span>
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel id="chat" class="relative" :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <UDashboardNavbar title="Lastra Chat">
          <template #right>
            <div class="flex items-center gap-3">
              <UBadge :color="chat.connectionStatus.value === 'connected' ? 'success' : chat.connectionStatus.value === 'connecting' ? 'warning' : 'error'" variant="subtle">
                {{ chat.connectionStatus.value }}
              </UBadge>

              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-log-out"
                @click="() => { chat.clearUser(); navigateTo('/') }"
              />
            </div>
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="h-full flex flex-col">
          <ChatMessageList />
          <div class="px-4">
            <ChatInput />
          </div>
        </div>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
  <div v-else class="flex items-center justify-center h-screen">
    <UCard>
      <p>Redirecting to login...</p>
    </UCard>
  </div>
</template>
