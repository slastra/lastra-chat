<script setup lang="ts">
// No auth middleware - public view-only page
const { clientId } = useUser()

// Generate random viewer name to avoid conflicts
const viewerName = `Viewer-${Math.random().toString(36).substring(2, 8)}`

// Connect to LiveKit room
const liveKitRoom = useLiveKitRoom({
  roomName: 'main-chat-room',
  participantName: viewerName,
  participantMetadata: {
    userId: clientId.value
  },
  autoConnect: true
})

// Find obs-stream participant
const obsParticipant = computed(() => {
  return liveKitRoom.remoteParticipants.value.find(p => p.identity === 'obs-stream')
})

// Get video track from obs-stream
const videoTrack = computed(() => {
  if (!obsParticipant.value) return undefined
  return liveKitRoom.getVideoTrack('obs-stream')
})

// Check if stream is available
const hasStream = computed(() => {
  return obsParticipant.value?.isCameraEnabled && !!videoTrack.value
})
</script>

<template>
  <div class="fixed inset-0 bg-black flex items-center justify-center">
    <!-- Video Stream -->
    <VideoTrack
      v-if="hasStream"
      :track="videoTrack"
      participant-identity="obs-stream"
      class="w-full h-full object-contain"
      :clickable="false"
    />

    <!-- Waiting Overlay -->
    <div
      v-else
      class="absolute inset-0 flex items-center justify-center"
    >
      <div class="text-center space-y-4">
        <UIcon
          name="i-lucide-video-off"
          class="text-neutral-600 h-24 w-24 mx-auto"
        />
        <h2 class="text-2xl font-medium text-white">
          Waiting for stream...
        </h2>
        <p class="text-neutral-400">
          The stream will appear here once OBS starts broadcasting
        </p>
      </div>
    </div>
  </div>
</template>
