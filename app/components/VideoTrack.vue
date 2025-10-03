<script setup lang="ts">
import type { RemoteVideoTrack, LocalVideoTrack, RemoteAudioTrack, LocalAudioTrack } from 'livekit-client'

interface Props {
  track?: RemoteVideoTrack | LocalVideoTrack | RemoteAudioTrack | LocalAudioTrack
  participantIdentity: string
  isLocal?: boolean
  muted?: boolean
  autoplay?: boolean
  playsinline?: boolean
  className?: string
  clickable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isLocal: false,
  muted: true,
  autoplay: true,
  playsinline: true,
  className: 'w-full rounded bg-black',
  clickable: true
})

const emit = defineEmits<{
  videoClick: [participantIdentity: string]
}>()

// Template refs for track attachment
const videoRef = ref<HTMLVideoElement>()
const audioRef = ref<HTMLAudioElement>()

// Track the current attached track to handle cleanup
const currentTrack = ref<typeof props.track>()

// Attach track to appropriate element
const attachTrack = () => {
  if (!props.track) return

  try {
    if (props.track.kind === 'video') {
      if (videoRef.value) {
        props.track.attach(videoRef.value)
        currentTrack.value = props.track
      }
    } else if (props.track.kind === 'audio') {
      if (audioRef.value) {
        props.track.attach(audioRef.value)
        currentTrack.value = props.track
      }
    }
  } catch (error) {
    console.error('[VideoTrack] Failed to attach track:', error)
  }
}

// Detach track from elements
const detachTrack = () => {
  if (currentTrack.value) {
    try {
      currentTrack.value.detach()
      currentTrack.value = undefined
    } catch (error) {
      console.error('[VideoTrack] Failed to detach track:', error)
    }
  }
}

// Watch for track changes
watch(() => props.track, async (newTrack, oldTrack) => {
  // Detach old track if it exists
  if (oldTrack && currentTrack.value === oldTrack) {
    detachTrack()
  }

  // Attach new track after DOM updates
  if (newTrack) {
    await nextTick() // Wait for v-if to render the element
    attachTrack()
  }
}, { immediate: true })

// Re-attach track when component becomes visible again
const reattachTrack = () => {
  if (props.track && videoRef.value) {
    attachTrack()
  }
}

// Expose method for parent component to trigger re-attachment
defineExpose({
  reattachTrack
})

// Attach track when component is mounted and refs are available
onMounted(() => {
  nextTick(() => {
    if (props.track) {
      attachTrack()
    }
  })
})

// Clean up on unmount
onUnmounted(() => {
  detachTrack()
})

// Computed properties for element visibility
const isVideoTrack = computed(() => props.track?.kind === 'video')
const isAudioTrack = computed(() => props.track?.kind === 'audio')
const hasTrack = computed(() => !!props.track)

// Handle video click
const handleVideoClick = () => {
  if (props.clickable && isVideoTrack.value) {
    emit('videoClick', props.participantIdentity)
  }
}
</script>

<template>
  <div class=" ">
    <!-- Video element for video tracks -->
    <video
      v-if="isVideoTrack"
      ref="videoRef"
      :class="[className, { 'cursor-pointer hover:opacity-90 transition-opacity': clickable && isVideoTrack }]"
      :muted="muted"
      :autoplay="autoplay"
      :playsinline="playsinline"
      :data-participant="participantIdentity"
      :data-local="isLocal"
      @click="handleVideoClick"
    />

    <!-- Audio element for audio tracks -->
    <audio
      v-else-if="isAudioTrack"
      ref="audioRef"
      :muted="muted"
      :autoplay="autoplay"
      :data-participant="participantIdentity"
      :data-local="isLocal"
    />

    <!-- Placeholder when no track -->
    <div
      v-else-if="!hasTrack"
      :class="className"
      class="flex items-center justify-center text-dimmed min-h-[120px]"
    >
      <UIcon name="i-lucide-video-off" class="text-2xl" />
    </div>
  </div>
</template>
