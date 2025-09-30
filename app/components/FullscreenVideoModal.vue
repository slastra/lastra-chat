<script setup lang="ts">
import type { RemoteVideoTrack, LocalVideoTrack } from 'livekit-client'
import type { UseLiveKitRoomReturn } from '../composables/useLiveKitRoom'

interface Props {
  isOpen: boolean
  track?: RemoteVideoTrack | LocalVideoTrack
  participantName: string
  participantIdentity: string
  trackType: 'webcam' | 'screen'
}

const props = defineProps<Props>()
const liveKitRoom = inject('liveKitRoom') as UseLiveKitRoomReturn

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
}>()

// Computed for modal v-model
const modalOpen = computed({
  get: () => props.isOpen,
  set: (value: boolean) => emit('update:isOpen', value)
})

// Note: LiveKit's adaptive streaming will automatically request higher quality
// video when the video element is larger (fullscreen). The Room configuration
// has been updated to support higher resolution layers (up to 1080p).

// Ensure we don't keep the track attached when modal is not visible
const showVideo = computed(() => modalOpen.value && props.track)

// Close modal handler
const closeModal = () => {
  modalOpen.value = false
}
</script>

<template>
  <UModal
    v-model:open="modalOpen"
    fullscreen
    :ui="{

      overlay: 'bg-black/95',
      content: 'w-screen h-screen max-w-none max-h-none m-0 rounded-none shadow-none',
      header: 'hidden',
      body: 'sm:p-0 overflow-hidden',
      footer: 'hidden'
    }"
  >
    <template #body>
      <div class="flex items-center justify-center bg-black w-screen h-screen relative">
        <!-- Close button overlay -->
        <UButton
          icon="i-lucide-x"
          color="neutral"

          size="md"
          class="absolute top-4 right-4 z-50"
          @click.stop="closeModal"
        />

        <!-- Video content -->
        <VideoTrack
          v-if="showVideo"
          :key="`fullscreen-${participantIdentity}-${trackType}`"
          :track="track"
          :participant-identity="participantIdentity"
          :clickable="false"
          :muted="false"
          class="max-w-full max-h-full object-contain"
        />

        <!-- Video stats -->
        <VideoStats
          v-if="showVideo"
          :track="track"
          :is-local="participantIdentity === liveKitRoom?.localParticipant.value?.identity"
          class="absolute bottom-4 right-4 text-base z-40"
        />

        <!-- No video state -->
        <div v-else-if="modalOpen" class="text-white text-center">
          <UIcon name="i-lucide-video-off" class="text-4xl mb-2" />
          <p>No video stream available</p>
        </div>
      </div>
    </template>
  </UModal>
</template>
