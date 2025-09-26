<script setup lang="ts">
import type { RemoteVideoTrack, LocalVideoTrack } from 'livekit-client'

interface Props {
  isOpen: boolean
  track?: RemoteVideoTrack | LocalVideoTrack
  participantName: string
  participantIdentity: string
  trackType: 'webcam' | 'screen'
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
}>()

// Computed for modal v-model
const modalOpen = computed({
  get: () => props.isOpen,
  set: (value: boolean) => emit('update:isOpen', value)
})

// Track type label for header
const trackTypeLabel = computed(() => {
  return props.trackType === 'screen' ? 'Screen Share' : 'Webcam'
})

// Note: LiveKit's adaptive streaming will automatically request higher quality
// video when the video element is larger (fullscreen). The Room configuration
// has been updated to support higher resolution layers (up to 1080p).

// Ensure we don't keep the track attached when modal is not visible
const showVideo = computed(() => modalOpen.value && props.track)
</script>

<template>
  <UModal
    v-model:open="modalOpen"
    :title="`${participantName}'s ${trackTypeLabel}`"
    fullscreen
    :ui="{
      wrapper: 'flex items-center justify-center',

      body: 'sm:p-0'
    }"
  >
    <template #body>
      <div class="flex items-center justify-center bg-black h-full relative">
        <VideoTrack
          v-if="showVideo"
          :key="`fullscreen-${participantIdentity}-${trackType}`"
          :track="track"
          :participant-identity="participantIdentity"
          :clickable="false"
          :muted="false"
          class="max-w-full max-h-full object-contain"
        />
        <VideoStats
          v-if="showVideo"
          :track="track"
          class="absolute bottom-4 right-4 text-base"
        />
        <div v-else-if="modalOpen" class="text-white text-center">
          <UIcon name="i-lucide-video-off" class="text-4xl mb-2" />
          <p>No video stream available</p>
        </div>
      </div>
    </template>
  </UModal>
</template>
