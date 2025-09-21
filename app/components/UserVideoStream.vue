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

// Computed label for the button
const buttonLabel = computed(() =>
  props.streamType === 'desktop' ? 'Sharing screen' : 'Camera on'
)

// Computed icon for the button
const buttonIcon = computed(() =>
  props.streamType === 'desktop' ? 'i-lucide-monitor' : 'i-lucide-video'
)

// Watch for stream changes and attach to video element
watchEffect(() => {
  if (videoRef.value && props.stream) {
    videoRef.value.srcObject = props.stream
    videoRef.value.play().catch((err) => {
      console.error('[UserVideoStream] Failed to play video:', err)
    })
  } else if (videoRef.value && !props.stream) {
    videoRef.value.srcObject = null
  }
})

// Clean up on unmount
onUnmounted(() => {
  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
})
</script>

<template>
  <UCollapsible v-if="hasStream" class="w-full">
    <UButton
      :label="buttonLabel"
      :icon="buttonIcon"
      color="neutral"
      variant="subtle"
      trailing-icon="i-lucide-chevron-down"
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
