<script setup lang="ts">
interface Props {
  userId: string
  userName: string
  stream?: MediaStream | null
  streamType?: 'webcam' | 'desktop'
}

const props = defineProps<Props>()

const videoRef = ref<HTMLVideoElement>()
const hasStream = computed(() => !!props.stream)
const isExpanded = ref(true) // Start expanded to show video immediately
const playPromise = ref<Promise<void> | null>(null)

// Computed label for the button
const buttonLabel = computed(() =>
  props.streamType === 'desktop' ? 'Sharing screen' : 'Camera on'
)

// Computed icon for the button
const buttonIcon = computed(() =>
  props.streamType === 'desktop' ? 'i-lucide-monitor' : 'i-lucide-video'
)

// Safely attempt to play video
const attemptPlay = async () => {
  if (!videoRef.value || !props.stream) {
    return
  }

  try {
    // Cancel any pending play promise
    if (playPromise.value) {
      playPromise.value.catch(() => {}) // Silently catch to prevent unhandled rejection
    }

    // Set the stream
    videoRef.value.srcObject = props.stream

    // Wait for next tick to ensure DOM is stable
    await nextTick()

    // Only play if video element is still connected and stream is set
    if (videoRef.value && videoRef.value.srcObject === props.stream) {
      playPromise.value = videoRef.value.play()
      await playPromise.value
      playPromise.value = null
    }
  } catch (err: unknown) {
    // Only log if it's not an AbortError (which is expected when element is removed)
    if (err instanceof Error && err.name !== 'AbortError') {
      console.error(`[UserVideoStream] Failed to play video for ${props.userName}:`, err.message)
    }
    playPromise.value = null
  }
}

// Watch for stream changes and attach to video element
watch(() => props.stream, async (newStream) => {
  if (newStream) {
    await attemptPlay()
  } else if (videoRef.value) {
    // Cancel any pending play promise before removing stream
    if (playPromise.value) {
      playPromise.value.catch(() => {})
      playPromise.value = null
    }
    videoRef.value.srcObject = null
  }
}, { immediate: true })

// Also attempt to play when video element is mounted if we have a stream
onMounted(async () => {
  if (props.stream) {
    await nextTick()
    await attemptPlay()
  }
})

// Re-attempt play when expanded
watch(isExpanded, async (expanded) => {
  if (expanded && props.stream) {
    await nextTick()
    await attemptPlay()
  }
})

// Clean up on unmount
onUnmounted(() => {
  if (playPromise.value) {
    playPromise.value.catch(() => {})
    playPromise.value = null
  }
  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
})
</script>

<template>
  <UCollapsible
    v-if="hasStream"
    v-model:open="isExpanded"
    :unmount-on-hide="false"
    class="w-full"
  >
    <UButton
      :label="buttonLabel"
      :icon="buttonIcon"
      color="neutral"
      variant="subtle"
      :trailing-icon="isExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
      block
      size="xs"
    />

    <template #content>
      <div class="mt-1 rounded overflow-hidden bg-black relative">
        <video
          ref="videoRef"
          class="w-full h-auto object-contain"
          :muted="true"
          :autoplay="true"
          :playsinline="true"
        />
        <UBadge
          size="xs"
          color="black"
          variant="solid"
          class="absolute bottom-2 right-2 opacity-75"
        >
          {{ streamType === 'desktop' ? 'Screen' : 'Webcam' }}
        </UBadge>
      </div>
    </template>
  </UCollapsible>
</template>
