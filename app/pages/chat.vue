<script setup lang="ts">
import type { SignalingMessage } from '../../shared/types/webrtc'

const { loadBots } = useBots()
// Create a single WebSocket instance to share
const ws = useWebSocketChat()
const mediaStream = useMediaStream(ws)
const chat = useChat(ws)
const isReady = ref(false)

// Create handler functions to maintain reference
const handleWebRTCSignal = (data: unknown) => {
  mediaStream.handleSignalingMessage(data as SignalingMessage)
}

const handleUserList = () => {
  // Check for media connections after user list updates
  setTimeout(() => {
    mediaStream.checkAndConnectToExistingMedia()
  }, 100)
}

onMounted(async () => {
  // Load bots first
  await loadBots()
  isReady.value = chat.initialize()

  // Register WebRTC handlers with the mediaStream
  if (isReady.value) {
    ws.on('webrtc-signal', handleWebRTCSignal)
    ws.on('user-list', handleUserList)
  }
})

onUnmounted(() => {
  // Clean up handlers
  ws.off('webrtc-signal', handleWebRTCSignal)
  ws.off('user-list', handleUserList)
  chat.cleanup()
})

// Handle media control events
const handleWebcamToggle = (_enabled: boolean) => {
  mediaStream.toggleWebcam()
}

const handleMicToggle = (_enabled: boolean) => {
  mediaStream.toggleMic()
}

const handleScreenToggle = (_enabled: boolean) => {
  mediaStream.toggleScreen()
}

const handleDeviceChange = (_type: 'video' | 'audio', _deviceId: string) => {
  // Handle device change if needed
}
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
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-sm">
              <UIcon name="i-lucide-user" class="w-4 h-4" />
              <span class="font-medium">{{ chat.userName.value }}</span>
            </div>
            <MediaControls
              @webcam-toggle="handleWebcamToggle"
              @mic-toggle="handleMicToggle"
              @screen-toggle="handleScreenToggle"
              @device-change="handleDeviceChange"
            />
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

              <!-- Sound Settings Popover -->
              <UPopover>
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-volume-2"
                />

                <template #content>
                  <div class="p-4 w-96">
                    <SoundSettings />
                  </div>
                </template>
              </UPopover>

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

    <!-- Audio Enable Prompt -->
  </UDashboardGroup>
  <div v-else class="flex items-center justify-center h-screen">
    <UCard>
      <p>Redirecting to login...</p>
    </UCard>
  </div>
</template>
