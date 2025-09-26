<script setup lang="ts">
import type { RemoteVideoTrack, LocalVideoTrack } from 'livekit-client'
import { Track } from 'livekit-client'

interface Props {
  track?: RemoteVideoTrack | LocalVideoTrack
  className?: string
}

const props = withDefaults(defineProps<Props>(), {
  className: ''
})

// Track stats
const fps = ref(0)
const resolution = ref('')
const bitrate = ref(0)

// Statistics update interval
let statsInterval: NodeJS.Timeout | null = null

// Update statistics
const updateStats = async () => {
  if (!props.track || props.track.kind !== Track.Kind.Video) {
    fps.value = 0
    resolution.value = ''
    bitrate.value = 0
    return
  }

  try {
    const videoTrack = props.track as RemoteVideoTrack | LocalVideoTrack

    // Get video element dimensions - tracks expose this via their media stream
    const mediaStreamTrack = videoTrack.mediaStreamTrack
    if (mediaStreamTrack) {
      const settings = mediaStreamTrack.getSettings()
      if (settings.width && settings.height) {
        resolution.value = `${settings.width}x${settings.height}`
      }
    }

    // Get statistics for FPS and bitrate
    const stats = await videoTrack.getRTCStatsReport()
    if (stats) {
      stats.forEach((stat) => {
        // Look for inbound-rtp stats (for remote tracks) or outbound-rtp stats (for local tracks)
        if (stat.type === 'inbound-rtp' && stat.mediaType === 'video') {
          // Remote track stats
          fps.value = Math.round(stat.framesPerSecond || 0)
          if (stat.bytesReceived && stat.timestamp) {
            // Calculate bitrate (this is simplified, ideally we'd track delta)
            bitrate.value = Math.round((stat.bytesReceived * 8) / 1000) // kbps
          }
        } else if (stat.type === 'outbound-rtp' && stat.mediaType === 'video') {
          // Local track stats
          fps.value = Math.round(stat.framesPerSecond || 0)
          if (stat.bytesSent && stat.timestamp) {
            // Calculate bitrate (this is simplified, ideally we'd track delta)
            bitrate.value = Math.round((stat.bytesSent * 8) / 1000) // kbps
          }
        }
      })
    }
  } catch (error) {
    console.error('[VideoStats] Failed to get statistics:', error)
  }
}

// Watch for track changes
watch(() => props.track, (newTrack) => {
  // Clear old interval
  if (statsInterval) {
    clearInterval(statsInterval)
    statsInterval = null
  }

  // Set up new interval if track exists
  if (newTrack && newTrack.kind === Track.Kind.Video) {
    updateStats() // Initial update
    statsInterval = setInterval(updateStats, 1000) // Update every second
  } else {
    fps.value = 0
    resolution.value = ''
    bitrate.value = 0
  }
}, { immediate: true })

// Clean up on unmount
onUnmounted(() => {
  if (statsInterval) {
    clearInterval(statsInterval)
    statsInterval = null
  }
})

// Format display text
const displayText = computed(() => {
  if (!resolution.value) return ''
  return `${resolution.value} • ${fps.value} FPS`
})
</script>

<template>
  <div
    v-if="displayText"
    :class="[
      'inline-flex items-center gap-1 px-2 py-1 text-xs font-mono bg-black/60 text-white rounded',
      className
    ]"
  >
    <span>{{ displayText }}</span>
  </div>
</template>
