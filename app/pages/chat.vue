<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const { loadBots } = useBots()
const { clientId, userName } = useUser()

const isReady = ref(false)

// Initialize LiveKit room
const liveKitRoom = useLiveKitRoom({
  roomName: 'main-chat-room',
  participantName: userName.value || 'Anonymous',
  participantMetadata: {
    userId: clientId.value
  },
  autoConnect: false
})

// Initialize LiveKit chat
const liveKitChat = useLiveKitChat({
  room: liveKitRoom.room,
  userId: clientId.value,
  userName: userName.value || 'Anonymous'
})

// Initialize LiveKit bot integration
const liveKitBots = useLiveKitBots({
  liveKitChat,
  liveKitRoom,
  userId: clientId.value,
  userName: userName.value || 'Anonymous'
})

// Legacy chat compatibility layer for remaining components
const legacyChat = {
  clearUser: () => {
    // Handle user logout
  }
}

// Provide instances to child components
provide('liveKitRoom', liveKitRoom)
provide('liveKitChat', liveKitChat)
provide('liveKitBots', liveKitBots)
provide('chat', legacyChat)

onMounted(async () => {
  // Middleware handles auth, safe to proceed

  // Load bots first
  await loadBots()

  // Set up system message listeners for participant events
  liveKitRoom.on('participantConnected', (participant) => {
    const p = participant as { name?: string, identity: string }
    const name = p.name || p.identity
    liveKitChat.addLocalSystemMessage(`${name} joined the chat`)
    // Play join sound for other users
    const { playSound } = useSoundManager()
    playSound('userJoined')
  })

  liveKitRoom.on('participantDisconnected', (participant) => {
    const p = participant as { name?: string, identity: string }
    const name = p.name || p.identity
    liveKitChat.addLocalSystemMessage(`${name} left the chat`)
    // Play leave sound for other users
    const { playSound } = useSoundManager()
    playSound('userLeft')
  })

  try {
    // Connect to LiveKit room
    await liveKitRoom.connect()
    isReady.value = true
  } catch (error) {
    console.error('[Chat] Failed to connect to LiveKit:', error)
    // Connection error handling - user will see disconnected status
    isReady.value = false
  }
})

onUnmounted(async () => {
  await liveKitRoom.disconnect()
})

// Handle media control events
const handleWebcamToggle = async () => {
  try {
    await liveKitRoom.enableCamera(!liveKitRoom.isCameraEnabled.value)
  } catch (error) {
    console.error('[Chat] Failed to toggle camera:', error)
  }
}

const handleMicToggle = async () => {
  try {
    await liveKitRoom.enableMicrophone(!liveKitRoom.isMicrophoneEnabled.value)
  } catch (error) {
    console.error('[Chat] Failed to toggle microphone:', error)
  }
}

const handleScreenToggle = async () => {
  try {
    await liveKitRoom.enableScreenShare(!liveKitRoom.isScreenShareEnabled.value)
  } catch (error) {
    console.error('[Chat] Failed to toggle screen share:', error)
  }
}

const handleDeviceChange = async (type: 'videoInput' | 'audioInput' | 'audioOutput', deviceId: string) => {
  try {
    switch (type) {
      case 'audioInput':
        await liveKitRoom.switchMicrophone(deviceId)
        break
      case 'videoInput':
        await liveKitRoom.switchCamera(deviceId)
        break
      case 'audioOutput':
        await liveKitRoom.switchSpeaker(deviceId)
        break
    }
  } catch (error) {
    console.error(`[Chat] Failed to change ${type} device:`, error)
  }
}

const handleScreenQualityChange = (quality: 'gaming' | 'presentation' | 'balanced' | 'bandwidth') => {
  liveKitRoom.setScreenShareQuality(quality)
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
        <div class="flex items-center justify-between w-full  gap-2">
          <h3 class="font-semibold ">
            Online Users
          </h3>
          <UBadge
            :label="String(liveKitRoom.participantCount.value)"
            color="success"
            variant="subtle"
          />
        </div>
      </template>

      <div class="flex-1 min-h-0 w-full">
        <ChatUserList />
      </div>

      <template #footer>
        <div class="w-full py-4">
          <StreamingMenu
            :webcam-enabled="liveKitRoom.isCameraEnabled.value"
            :mic-enabled="liveKitRoom.isMicrophoneEnabled.value"
            :screen-enabled="liveKitRoom.isScreenShareEnabled.value"
            :supports-speaker-selection="liveKitRoom.supportsSpeakerSelection.value"
            :selected-camera="liveKitRoom.selectedCamera.value ?? undefined"
            :selected-microphone="liveKitRoom.selectedMicrophone.value ?? undefined"
            :selected-speaker="liveKitRoom.selectedSpeaker.value ?? undefined"
            :screen-share-quality="liveKitRoom.screenShareQuality.value"
            @webcam-toggle="handleWebcamToggle"
            @mic-toggle="handleMicToggle"
            @screen-toggle="handleScreenToggle"
            @device-change="handleDeviceChange"
            @screen-quality-change="handleScreenQualityChange"
          />
          <!-- Audio Level Display -->
          <div
            v-if="liveKitRoom.isMicrophoneEnabled.value"
            class="mt-3 space-y-1"
          >
            <div class="flex items-center justify-between text-xs text-muted">
              <span>Audio Level</span>
              <span>{{ liveKitRoom.audioLevel.value }}%</span>
            </div>
            <UProgress
              :model-value="liveKitRoom.audioLevel.value"
              :max="100"
              size="sm"
              :color="liveKitRoom.audioLevel.value > 80 ? 'error' : liveKitRoom.audioLevel.value > 50 ? 'warning' : 'primary'"
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
              <UBadge :color="liveKitRoom.isConnected.value ? 'success' : liveKitRoom.isConnecting.value ? 'warning' : 'error'" variant="subtle">
                {{ liveKitRoom.isConnected.value ? 'connected' : liveKitRoom.isConnecting.value ? 'connecting' : 'disconnected' }}
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
                @click="async () => { await liveKitRoom.disconnect(); legacyChat.clearUser(); navigateTo('/') }"
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
      <p>Just a moment...</p>
    </UCard>
  </div>
</template>
