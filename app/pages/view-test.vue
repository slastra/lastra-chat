<script setup lang="ts">
const {
  testId,
  roomId,
  role,
  localStream,
  remoteStream,
  isConnected,
  connectionState,
  iceConnectionState,
  stats,
  debugLogs,
  startSharing,
  startViewing,
  stopSharing,
  stopViewing
} = useScreenShareTest()

const localVideoRef = ref<HTMLVideoElement>()
const remoteVideoRef = ref<HTMLVideoElement>()
const showDebugConsole = ref(true)

// Set up video streams
watchEffect(() => {
  if (localVideoRef.value && localStream.value) {
    localVideoRef.value.srcObject = localStream.value
  }
})

watchEffect(() => {
  if (remoteVideoRef.value && remoteStream.value) {
    remoteVideoRef.value.srcObject = remoteStream.value
  }
})

const handleStartSharing = async () => {
  await startSharing()
}

const handleStartViewing = async () => {
  await startViewing()
}

const handleStop = () => {
  if (role.value === 'sharer') {
    stopSharing()
  } else if (role.value === 'viewer') {
    stopViewing()
  }
}

const formatBitrate = (kbps: number) => {
  if (kbps > 1000) {
    return `${(kbps / 1000).toFixed(1)} Mbps`
  }
  return `${kbps} kbps`
}

const connectionStateColor = computed(() => {
  switch (connectionState.value) {
    case 'connected': return 'success'
    case 'connecting': return 'warning'
    case 'failed': return 'error'
    case 'closed': return 'error'
    default: return 'neutral'
  }
})

const iceStateColor = computed(() => {
  switch (iceConnectionState.value) {
    case 'connected': return 'success'
    case 'completed': return 'success'
    case 'checking': return 'warning'
    case 'failed': return 'error'
    case 'disconnected': return 'error'
    default: return 'neutral'
  }
})
</script>

<template>
  <div class="min-h-screen bg-surface">
    <UContainer>
      <!-- Header -->
      <div class="py-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-3xl font-bold">
              Screen Share P2P Test
            </h1>
            <p class="text-muted-foreground mt-1">
              Test screen sharing between two browser tabs
            </p>
          </div>
          <div class="flex items-center gap-4">
            <UBadge variant="subtle" color="primary">
              ID: {{ testId }}
            </UBadge>
            <UButton
              icon="i-lucide-arrow-left"
              variant="ghost"
              color="neutral"
              to="/chat"
            >
              Back
            </UButton>
          </div>
        </div>
      </div>

      <!-- Room Controls -->
      <UCard class="mb-6">
        <div class="space-y-4">
          <div class="flex items-center gap-4">
            <UInput
              v-model="roomId"
              placeholder="Enter Room ID (e.g., test123)"
              :disabled="role !== 'idle'"
              class="flex-1"
            />
            <UBadge
              :color="isConnected ? 'success' : 'neutral'"
              variant="subtle"
              size="lg"
            >
              {{ isConnected ? 'Connected' : 'Not Connected' }}
            </UBadge>
          </div>

          <div class="flex gap-4">
            <UButton
              icon="i-lucide-monitor"
              size="lg"
              :disabled="role !== 'idle' || !roomId"
              @click="handleStartSharing"
            >
              Start Sharing
            </UButton>
            <UButton
              icon="i-lucide-eye"
              size="lg"
              variant="outline"
              :disabled="role !== 'idle' || !roomId"
              @click="handleStartViewing"
            >
              Start Viewing
            </UButton>
            <UButton
              v-if="role !== 'idle'"
              icon="i-lucide-x"
              size="lg"
              color="error"
              @click="handleStop"
            >
              Stop {{ role === 'sharer' ? 'Sharing' : 'Viewing' }}
            </UButton>
          </div>

          <div v-if="role !== 'idle'" class="flex items-center gap-6 text-sm">
            <div class="flex items-center gap-2">
              <span class="text-muted-foreground">Role:</span>
              <UBadge :color="role === 'sharer' ? 'error' : 'blue'" variant="subtle">
                {{ role }}
              </UBadge>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-muted-foreground">Connection:</span>
              <UBadge :color="connectionStateColor" variant="subtle">
                {{ connectionState }}
              </UBadge>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-muted-foreground">ICE:</span>
              <UBadge :color="iceStateColor" variant="subtle">
                {{ iceConnectionState }}
              </UBadge>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Video Grid -->
      <div class="grid grid-cols-2 gap-6 mb-6">
        <!-- Local Stream -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">
                Local Stream (Sharer)
              </h3>
              <UBadge v-if="role === 'sharer' && localStream" color="error" variant="solid">
                <UIcon name="i-lucide-radio" class="w-3 h-3 mr-1" />
                LIVE
              </UBadge>
            </div>
          </template>

          <div class="relative bg-black rounded-lg overflow-hidden aspect-video">
            <video
              v-if="role === 'sharer'"
              ref="localVideoRef"
              autoplay
              playsinline
              muted
              class="w-full h-full object-contain"
            />
            <div v-else class="flex items-center justify-center h-full text-muted-foreground">
              <div class="text-center">
                <UIcon name="i-lucide-monitor" class="w-12 h-12 mb-2 opacity-50" />
                <p class="text-sm">
                  No local stream
                </p>
                <p class="text-xs opacity-75">
                  Start sharing to see preview
                </p>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Remote Stream -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">
                Remote Stream (Viewer)
              </h3>
              <UBadge v-if="role === 'viewer' && remoteStream" color="blue" variant="solid">
                <UIcon name="i-lucide-eye" class="w-3 h-3 mr-1" />
                VIEWING
              </UBadge>
            </div>
          </template>

          <div class="relative bg-black rounded-lg overflow-hidden aspect-video">
            <video
              v-if="role === 'viewer'"
              ref="remoteVideoRef"
              autoplay
              playsinline
              class="w-full h-full object-contain"
            />
            <div v-else class="flex items-center justify-center h-full text-muted-foreground">
              <div class="text-center">
                <UIcon name="i-lucide-eye" class="w-12 h-12 mb-2 opacity-50" />
                <p class="text-sm">
                  No remote stream
                </p>
                <p class="text-xs opacity-75">
                  Join as viewer to see stream
                </p>
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Statistics -->
      <UCard v-if="isConnected" class="mb-6">
        <template #header>
          <h3 class="font-semibold">
            Connection Statistics
          </h3>
        </template>

        <div class="grid grid-cols-6 gap-4">
          <div>
            <div class="text-sm text-muted-foreground mb-1">
              Bitrate
            </div>
            <div class="font-mono font-medium">
              {{ formatBitrate(stats.bitrate) }}
            </div>
          </div>
          <div>
            <div class="text-sm text-muted-foreground mb-1">
              Framerate
            </div>
            <div class="font-mono font-medium">
              {{ stats.framerate }} fps
            </div>
          </div>
          <div>
            <div class="text-sm text-muted-foreground mb-1">
              Resolution
            </div>
            <div class="font-mono font-medium">
              {{ stats.resolution || 'N/A' }}
            </div>
          </div>
          <div>
            <div class="text-sm text-muted-foreground mb-1">
              Packets Lost
            </div>
            <div class="font-mono font-medium">
              {{ stats.packetsLost }}
            </div>
          </div>
          <div>
            <div class="text-sm text-muted-foreground mb-1">
              Jitter
            </div>
            <div class="font-mono font-medium">
              {{ stats.jitter.toFixed(2) }} ms
            </div>
          </div>
          <div>
            <div class="text-sm text-muted-foreground mb-1">
              RTT
            </div>
            <div class="font-mono font-medium">
              {{ stats.roundTripTime }} ms
            </div>
          </div>
        </div>
      </UCard>

      <!-- Debug Console -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">
              Debug Console
            </h3>
            <UButton
              :icon="showDebugConsole ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              variant="ghost"
              size="sm"
              @click="showDebugConsole = !showDebugConsole"
            />
          </div>
        </template>

        <div v-if="showDebugConsole" class="space-y-1 max-h-96 overflow-y-auto font-mono text-xs">
          <div v-if="debugLogs.length === 0" class="text-muted-foreground text-center py-8">
            No debug logs yet...
          </div>
          <div
            v-for="(log, idx) in debugLogs"
            :key="idx"
            class="flex gap-2 py-1 px-2 rounded hover:bg-elevated"
            :class="{
              'text-success': log.type === 'success',
              'text-error': log.type === 'error',
              'text-muted-foreground': log.type === 'info'
            }"
          >
            <span class="opacity-50">{{ log.time }}</span>
            <span>{{ log.message }}</span>
          </div>
        </div>
      </UCard>

      <!-- Instructions -->
      <UCard class="mt-6">
        <template #header>
          <h3 class="font-semibold">
            How to Test
          </h3>
        </template>

        <div class="grid grid-cols-2 gap-6">
          <div>
            <h4 class="font-medium mb-3">
              Tab 1: Sharer
            </h4>
            <ol class="space-y-2 text-sm text-muted-foreground">
              <li>1. Enter a Room ID (e.g., "test123")</li>
              <li>2. Click "Start Sharing"</li>
              <li>3. Select screen/window to share</li>
              <li>4. Wait for viewer to connect</li>
            </ol>
          </div>
          <div>
            <h4 class="font-medium mb-3">
              Tab 2: Viewer
            </h4>
            <ol class="space-y-2 text-sm text-muted-foreground">
              <li>1. Open this page in another tab</li>
              <li>2. Enter the same Room ID</li>
              <li>3. Click "Start Viewing"</li>
              <li>4. Stream should appear automatically</li>
            </ol>
          </div>
        </div>

        <UAlert
          class="mt-4"
          color="primary"
          variant="subtle"
          icon="i-lucide-info"
        >
          <template #description>
            Both tabs will use your TURN server at turn.lastra.us for NAT traversal and relay if needed.
          </template>
        </UAlert>
      </UCard>
    </UContainer>
  </div>
</template>
