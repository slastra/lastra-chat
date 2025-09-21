<script setup lang="ts">
const {
  testId,
  roomId,
  role,
  localStream,
  remoteStream,
  isConnected,
  connectionState: _connectionState,
  cameras,
  microphones,
  selectedCamera,
  selectedMicrophone,
  enableVideo,
  enableAudio,
  permissionGranted,
  stats,
  debugLogs,
  startBroadcast,
  startViewing,
  stopBroadcast,
  stopViewing,
  toggleVideo,
  toggleAudio,
  switchCamera: _switchCamera,
  switchMicrophone: _switchMicrophone,
  ensurePermissions
} = useWebcamTest()

const localVideoRef = ref<HTMLVideoElement>()
const remoteVideoRef = ref<HTMLVideoElement>()
const showDebugConsole = ref(false)
const audioLevelRef = ref(0)

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

// Audio level monitoring
const monitorAudioLevel = () => {
  if (!localStream.value) return

  const audioContext = new AudioContext()
  const analyser = audioContext.createAnalyser()
  const microphone = audioContext.createMediaStreamSource(localStream.value)
  const dataArray = new Uint8Array(analyser.frequencyBinCount)

  microphone.connect(analyser)

  const checkAudioLevel = () => {
    analyser.getByteFrequencyData(dataArray)
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length
    audioLevelRef.value = average / 255 * 100

    if (role.value === 'broadcaster') {
      requestAnimationFrame(checkAudioLevel)
    }
  }

  checkAudioLevel()
}

watch(localStream, (stream) => {
  if (stream && enableAudio.value) {
    monitorAudioLevel()
  }
})

const handleStop = () => {
  if (role.value === 'broadcaster') {
    stopBroadcast()
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

const requestPermissions = async () => {
  await ensurePermissions()
}
</script>

<template>
  <div class="min-h-screen bg-surface">
    <UContainer>
      <!-- Header -->
      <div class="py-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-3xl font-bold">
              Webcam & Audio Test
            </h1>
            <p class="text-muted-foreground mt-1">
              Test video calling with webcam and microphone
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

      <!-- Permission Check -->
      <UAlert
        v-if="!permissionGranted"
        color="warning"
        variant="subtle"
        class="mb-6"
        icon="i-lucide-shield-alert"
      >
        <template #description>
          <div class="flex items-center justify-between">
            <span>Camera and microphone permissions are required for this test</span>
            <UButton
              size="sm"
              @click="requestPermissions"
            >
              Grant Permissions
            </UButton>
          </div>
        </template>
      </UAlert>

      <!-- Device Selection -->
      <UCard v-if="permissionGranted" class="mb-6">
        <template #header>
          <h3 class="font-semibold">
            Device Settings
          </h3>
        </template>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-sm font-medium mb-2 block">Camera</label>
            <USelect
              v-model="selectedCamera"
              :items="cameras"
              value-key="deviceId"
              option-label-key="label"
              :disabled="role !== 'idle'"
              placeholder="Select camera"
            />
          </div>
          <div>
            <label class="text-sm font-medium mb-2 block">Microphone</label>
            <USelect
              v-model="selectedMicrophone"
              :items="microphones"
              value-key="deviceId"
              option-label-key="label"
              :disabled="role !== 'idle'"
              placeholder="Select microphone"
            />
          </div>
        </div>
      </UCard>

      <!-- Room Controls -->
      <UCard class="mb-6">
        <div class="space-y-4">
          <div class="flex items-center gap-4">
            <UInput
              v-model="roomId"
              placeholder="Enter Room ID (e.g., meeting123)"
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
              icon="i-lucide-video"
              size="lg"
              :disabled="role !== 'idle' || !roomId || !permissionGranted"
              @click="startBroadcast"
            >
              Start Broadcasting
            </UButton>
            <UButton
              icon="i-lucide-eye"
              size="lg"
              variant="outline"
              :disabled="role !== 'idle' || !roomId"
              @click="startViewing"
            >
              Join as Viewer
            </UButton>
            <UButton
              v-if="role !== 'idle'"
              icon="i-lucide-phone-off"
              size="lg"
              color="error"
              @click="handleStop"
            >
              End Call
            </UButton>
          </div>

          <!-- Media Controls -->
          <div v-if="role === 'broadcaster'" class="flex items-center gap-4">
            <UButton
              :icon="enableVideo ? 'i-lucide-video' : 'i-lucide-video-off'"
              :color="enableVideo ? 'primary' : 'error'"
              variant="soft"
              @click="toggleVideo"
            >
              {{ enableVideo ? 'Camera On' : 'Camera Off' }}
            </UButton>
            <UButton
              :icon="enableAudio ? 'i-lucide-mic' : 'i-lucide-mic-off'"
              :color="enableAudio ? 'primary' : 'error'"
              variant="soft"
              @click="toggleAudio"
            >
              {{ enableAudio ? 'Mic On' : 'Mic Off' }}
            </UButton>

            <!-- Audio Level Indicator -->
            <div class="flex items-center gap-2 flex-1">
              <UIcon name="i-lucide-volume-2" class="w-4 h-4 text-muted-foreground" />
              <div class="flex-1 h-2 bg-elevated rounded-full overflow-hidden">
                <div
                  class="h-full bg-success transition-all duration-100"
                  :style="`width: ${audioLevelRef}%`"
                />
              </div>
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
                Your Camera
              </h3>
              <div class="flex items-center gap-2">
                <UBadge v-if="!enableVideo && role === 'broadcaster'" color="neutral" variant="subtle">
                  <UIcon name="i-lucide-video-off" class="w-3 h-3 mr-1" />
                  Video Off
                </UBadge>
                <UBadge v-if="!enableAudio && role === 'broadcaster'" color="neutral" variant="subtle">
                  <UIcon name="i-lucide-mic-off" class="w-3 h-3 mr-1" />
                  Muted
                </UBadge>
                <UBadge v-if="role === 'broadcaster' && localStream" color="error" variant="solid">
                  <UIcon name="i-lucide-radio" class="w-3 h-3 mr-1" />
                  LIVE
                </UBadge>
              </div>
            </div>
          </template>

          <div class="relative bg-black rounded-lg overflow-hidden aspect-video">
            <video
              v-if="role === 'broadcaster'"
              ref="localVideoRef"
              autoplay
              playsinline
              muted
              class="w-full h-full object-cover"
              :class="{ 'opacity-0': !enableVideo }"
            />
            <div
              v-if="role === 'broadcaster' && !enableVideo"
              class="absolute inset-0 flex items-center justify-center"
            >
              <div class="text-center">
                <div class="w-24 h-24 rounded-full bg-elevated flex items-center justify-center mx-auto mb-2">
                  <UIcon name="i-lucide-user" class="w-12 h-12 text-muted-foreground" />
                </div>
                <p class="text-sm text-muted-foreground">
                  Camera is off
                </p>
              </div>
            </div>
            <div v-if="role !== 'broadcaster'" class="flex items-center justify-center h-full text-muted-foreground">
              <div class="text-center">
                <UIcon name="i-lucide-video" class="w-12 h-12 mb-2 opacity-50" />
                <p class="text-sm">
                  No local stream
                </p>
                <p class="text-xs opacity-75">
                  Start broadcasting to see preview
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
                Remote Stream
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
              class="w-full h-full object-cover"
            />
            <div v-else class="flex items-center justify-center h-full text-muted-foreground">
              <div class="text-center">
                <UIcon name="i-lucide-users" class="w-12 h-12 mb-2 opacity-50" />
                <p class="text-sm">
                  No remote stream
                </p>
                <p class="text-xs opacity-75">
                  Join as viewer to see broadcast
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

        <div class="grid grid-cols-2 gap-6">
          <!-- Video Stats -->
          <div>
            <h4 class="text-sm font-medium mb-3 text-muted-foreground">
              Video
            </h4>
            <div class="grid grid-cols-3 gap-4">
              <div>
                <div class="text-xs text-muted-foreground mb-1">
                  Bitrate
                </div>
                <div class="font-mono text-sm font-medium">
                  {{ formatBitrate(stats.videoBitrate) }}
                </div>
              </div>
              <div>
                <div class="text-xs text-muted-foreground mb-1">
                  Framerate
                </div>
                <div class="font-mono text-sm font-medium">
                  {{ stats.framerate }} fps
                </div>
              </div>
              <div>
                <div class="text-xs text-muted-foreground mb-1">
                  Resolution
                </div>
                <div class="font-mono text-sm font-medium">
                  {{ stats.resolution || 'N/A' }}
                </div>
              </div>
              <div>
                <div class="text-xs text-muted-foreground mb-1">
                  Packets Lost
                </div>
                <div class="font-mono text-sm font-medium">
                  {{ stats.videoPacketsLost }}
                </div>
              </div>
            </div>
          </div>

          <!-- Audio Stats -->
          <div>
            <h4 class="text-sm font-medium mb-3 text-muted-foreground">
              Audio
            </h4>
            <div class="grid grid-cols-3 gap-4">
              <div>
                <div class="text-xs text-muted-foreground mb-1">
                  Bitrate
                </div>
                <div class="font-mono text-sm font-medium">
                  {{ formatBitrate(stats.audioBitrate) }}
                </div>
              </div>
              <div>
                <div class="text-xs text-muted-foreground mb-1">
                  Packets Lost
                </div>
                <div class="font-mono text-sm font-medium">
                  {{ stats.audioPacketsLost }}
                </div>
              </div>
              <div>
                <div class="text-xs text-muted-foreground mb-1">
                  RTT
                </div>
                <div class="font-mono text-sm font-medium">
                  {{ stats.roundTripTime }} ms
                </div>
              </div>
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
            >
              {{ showDebugConsole ? 'Hide' : 'Show' }}
            </UButton>
          </div>
        </template>

        <div v-if="showDebugConsole" class="space-y-1 max-h-64 overflow-y-auto font-mono text-xs">
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
    </UContainer>
  </div>
</template>
