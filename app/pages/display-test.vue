<script setup lang="ts">
const {
  localStream,
  remoteStream,
  shareStatus,
  viewerCount,
  connectionStats,
  enabled: _enabled,
  startScreenShare,
  stopScreenShare
} = useScreenShare()

const localVideoRef = ref<HTMLVideoElement>()
const remoteVideoRef = ref<HTMLVideoElement>()
const isFullscreen = ref(false)

// Display local stream when sharing
watchEffect(() => {
  if (localVideoRef.value && localStream.value) {
    localVideoRef.value.srcObject = localStream.value
  }
})

// Display remote stream when viewing
watchEffect(() => {
  if (remoteVideoRef.value && remoteStream.value) {
    remoteVideoRef.value.srcObject = remoteStream.value
  }
})

const toggleScreenShare = async () => {
  if (shareStatus.value === 'sharing') {
    stopScreenShare()
  } else {
    await startScreenShare()
  }
}

const toggleFullscreen = () => {
  if (!isFullscreen.value) {
    if (shareStatus.value === 'sharing' && localVideoRef.value) {
      localVideoRef.value.requestFullscreen()
    } else if (shareStatus.value === 'viewing' && remoteVideoRef.value) {
      remoteVideoRef.value.requestFullscreen()
    }
    isFullscreen.value = true
  } else {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    }
    isFullscreen.value = false
  }
}

const formatBitrate = (kbps: number) => {
  if (kbps > 1000) {
    return `${(kbps / 1000).toFixed(1)} Mbps`
  }
  return `${kbps} kbps`
}

// Handle fullscreen change
onMounted(() => {
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement
  })
})
</script>

<template>
  <div class="min-h-screen bg-surface">
    <UContainer>
      <!-- Header -->
      <div class="py-8">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-3xl font-bold">
              Screen Sharing Test
            </h1>
            <p class="text-muted-foreground mt-1">
              Test WebRTC screen sharing with TURN server
            </p>
          </div>
          <div class="flex gap-4">
            <UButton
              icon="i-lucide-arrow-left"
              variant="ghost"
              color="neutral"
              to="/chat"
            >
              Back to Chat
            </UButton>
            <UButton
              icon="i-lucide-server"
              variant="ghost"
              color="neutral"
              to="/turn-test"
            >
              TURN Test
            </UButton>
          </div>
        </div>
      </div>

      <!-- Controls and Status -->
      <UCard class="mb-6">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <UButton
              :icon="shareStatus === 'sharing' ? 'i-lucide-monitor-off' : 'i-lucide-monitor'"
              :color="shareStatus === 'sharing' ? 'error' : 'primary'"
              size="lg"
              :disabled="shareStatus === 'viewing'"
              @click="toggleScreenShare"
            >
              {{ shareStatus === 'sharing' ? 'Stop Sharing' : 'Start Sharing' }}
            </UButton>

            <div class="flex items-center gap-6">
              <!-- Status Badge -->
              <div class="flex items-center gap-2">
                <span class="text-sm text-muted-foreground">Status:</span>
                <UBadge
                  :color="shareStatus === 'sharing' ? 'success' : shareStatus === 'viewing' ? 'blue' : 'neutral'"
                  variant="subtle"
                >
                  {{ shareStatus }}
                </UBadge>
              </div>

              <!-- Viewer Count (when sharing) -->
              <div v-if="shareStatus === 'sharing'" class="flex items-center gap-2">
                <UIcon name="i-lucide-users" class="w-4 h-4 text-muted-foreground" />
                <span class="text-sm">
                  {{ viewerCount }} {{ viewerCount === 1 ? 'viewer' : 'viewers' }}
                </span>
              </div>
            </div>
          </div>

          <!-- Fullscreen Button -->
          <UButton
            v-if="shareStatus !== 'idle'"
            :icon="isFullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'"
            variant="ghost"
            color="neutral"
            @click="toggleFullscreen"
          >
            {{ isFullscreen ? 'Exit Fullscreen' : 'Fullscreen' }}
          </UButton>
        </div>
      </UCard>

      <!-- Video Display -->
      <UCard v-if="shareStatus !== 'idle'" class="mb-6">
        <div class="relative bg-black rounded-lg overflow-hidden">
          <!-- Local Stream (when sharing) -->
          <video
            v-if="shareStatus === 'sharing'"
            ref="localVideoRef"
            autoplay
            playsinline
            muted
            class="w-full h-auto max-h-[600px] object-contain"
          />

          <!-- Remote Stream (when viewing) -->
          <video
            v-if="shareStatus === 'viewing'"
            ref="remoteVideoRef"
            autoplay
            playsinline
            class="w-full h-auto max-h-[600px] object-contain"
          />

          <!-- Loading State -->
          <div
            v-if="!localStream && !remoteStream && (shareStatus === 'sharing' || shareStatus === 'viewing')"
            class="flex items-center justify-center h-[400px]"
          >
            <div class="text-center">
              <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary mb-4" />
              <p class="text-muted-foreground">
                {{ shareStatus === 'sharing' ? 'Initializing screen capture...' : 'Connecting to stream...' }}
              </p>
            </div>
          </div>

          <!-- Status Overlay -->
          <div class="absolute top-4 left-4">
            <UBadge
              :color="shareStatus === 'sharing' ? 'error' : 'blue'"
              variant="solid"
              class="shadow-lg"
            >
              <UIcon
                :name="shareStatus === 'sharing' ? 'i-lucide-radio' : 'i-lucide-eye'"
                class="w-3 h-3 mr-1"
              />
              {{ shareStatus === 'sharing' ? 'LIVE' : 'VIEWING' }}
            </UBadge>
          </div>
        </div>
      </UCard>

      <!-- Connection Stats -->
      <UCard v-if="shareStatus !== 'idle' && (connectionStats.bitrate > 0 || connectionStats.resolution)">
        <template #header>
          <h3 class="font-semibold">
            Connection Statistics
          </h3>
        </template>

        <div class="grid grid-cols-4 gap-6">
          <div>
            <div class="text-sm text-muted-foreground mb-1">
              Bitrate
            </div>
            <div class="font-mono font-medium">
              {{ formatBitrate(connectionStats.bitrate) }}
            </div>
          </div>

          <div>
            <div class="text-sm text-muted-foreground mb-1">
              Framerate
            </div>
            <div class="font-mono font-medium">
              {{ connectionStats.framerate }} fps
            </div>
          </div>

          <div>
            <div class="text-sm text-muted-foreground mb-1">
              Resolution
            </div>
            <div class="font-mono font-medium">
              {{ connectionStats.resolution || 'N/A' }}
            </div>
          </div>

          <div>
            <div class="text-sm text-muted-foreground mb-1">
              Latency
            </div>
            <div class="font-mono font-medium">
              {{ connectionStats.latency || 0 }} ms
            </div>
          </div>
        </div>
      </UCard>

      <!-- Instructions -->
      <UCard v-if="shareStatus === 'idle'">
        <template #header>
          <h3 class="font-semibold">
            How to Test Screen Sharing
          </h3>
        </template>

        <div class="space-y-4">
          <div class="flex gap-3">
            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span class="text-sm font-medium">1</span>
            </div>
            <div>
              <p class="font-medium">
                Start Screen Share
              </p>
              <p class="text-sm text-muted-foreground">
                Click "Start Sharing" to begin broadcasting your screen
              </p>
            </div>
          </div>

          <div class="flex gap-3">
            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span class="text-sm font-medium">2</span>
            </div>
            <div>
              <p class="font-medium">
                Select Screen or Window
              </p>
              <p class="text-sm text-muted-foreground">
                Choose what to share from your browser's screen picker
              </p>
            </div>
          </div>

          <div class="flex gap-3">
            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span class="text-sm font-medium">3</span>
            </div>
            <div>
              <p class="font-medium">
                View Connection Stats
              </p>
              <p class="text-sm text-muted-foreground">
                Monitor bitrate, framerate, and connection quality in real-time
              </p>
            </div>
          </div>

          <div class="flex gap-3">
            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span class="text-sm font-medium">4</span>
            </div>
            <div>
              <p class="font-medium">
                Test with Multiple Tabs
              </p>
              <p class="text-sm text-muted-foreground">
                Open another tab to test viewing the shared screen (once integrated with chat)
              </p>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Technical Info -->
      <UCard class="mt-6">
        <template #header>
          <h3 class="font-semibold">
            Technical Details
          </h3>
        </template>

        <div class="grid grid-cols-2 gap-6 text-sm">
          <div>
            <h4 class="font-medium mb-2">
              TURN Server
            </h4>
            <div class="space-y-1 text-muted-foreground">
              <p>Server: turn.lastra.us</p>
              <p>Ports: 3478 (STUN/TURN), 5349 (TLS)</p>
              <p>Auth: HMAC-SHA1</p>
            </div>
          </div>

          <div>
            <h4 class="font-medium mb-2">
              Capture Settings
            </h4>
            <div class="space-y-1 text-muted-foreground">
              <p>Resolution: Up to 1920x1080</p>
              <p>Framerate: 30 fps</p>
              <p>Audio: {{ false ? 'Enabled' : 'Disabled' }}</p>
            </div>
          </div>
        </div>
      </UCard>
    </UContainer>
  </div>
</template>

<style scoped>
video {
  background: #000;
}
</style>
