<script setup lang="ts">
import type { UseLiveKitRoomReturn } from '../composables/useLiveKitRoom'
import type { RemoteVideoTrack, LocalVideoTrack } from 'livekit-client'
import type { ComponentPublicInstance } from 'vue'
import { VideoQuality } from 'livekit-client'
import { GridStack } from 'gridstack'

const liveKitRoom = inject('liveKitRoom') as UseLiveKitRoomReturn

// Fullscreen modal state
const isFullscreenOpen = ref(false)
const selectedVideoTrack = ref<RemoteVideoTrack | LocalVideoTrack | undefined>()
const selectedParticipantName = ref('')
const selectedParticipantIdentity = ref('')
const selectedTrackType = ref<'webcam' | 'screen'>('webcam')

// Track refs for video components
interface VideoTrackInstance extends ComponentPublicInstance {
  reattachTrack?: () => void
}
const webcamRefs = ref<Record<string, VideoTrackInstance | null>>({})
const screenRefs = ref<Record<string, VideoTrackInstance | null>>({})

// GridStack instance - DO NOT use ref() to avoid proxy issues
const gridContainer = ref<HTMLElement>()
let grid: GridStack | null = null

// Reactive list of video participants
const videoParticipants = ref<Array<{
  id: string
  userId: string
  userName: string
  trackType: 'webcam' | 'screen'
  hasVideo: boolean
  hasAudio: boolean
  x?: number
  y?: number
  w?: number
  h?: number
}>>([])

// Track which participants we've added to the grid
const addedParticipants = new Set<string>()

// Smoothed audio levels for UI responsiveness (0..1)
// Uses time-based exponential smoothing so behaviour is stable across
// varying frame rates and when tabs are throttled.
const smoothedLevels = reactive<Record<string, number>>({})
let _raf = 0

// Ring visibility driven by LiveKit's active-speaker/audioLevel signal
// Use hysteresis to avoid flicker (values are 0..100)
const ringActive = reactive<Record<string, boolean>>({})
const RING_ON = 4
const RING_OFF = 2

watch([
  () => liveKitRoom?.remoteParticipants.value,
  () => liveKitRoom?.localParticipant.value?.identity,
  () => liveKitRoom?.audioLevel.value
], () => {
  // Update ringActive based on reported audioLevel from composable (0..100)
  const remotes = liveKitRoom?.remoteParticipants.value ?? []
  remotes.forEach((p) => {
    const id = p.identity
    const lvl = p.audioLevel ?? 0
    const prev = ringActive[id] ?? false
    if (lvl > RING_ON) ringActive[id] = true
    else if (lvl < RING_OFF) ringActive[id] = false
    else ringActive[id] = prev
  })

  // local participant
  const localId = liveKitRoom?.localParticipant.value?.identity
  if (localId) {
    const lvl = liveKitRoom?.audioLevel.value ?? 0
    const prev = ringActive[localId] ?? false
    if (lvl > RING_ON) ringActive[localId] = true
    else if (lvl < RING_OFF) ringActive[localId] = false
    else ringActive[localId] = prev
  }

  // ensure removed participants are turned off
  const currentIds = new Set(videoParticipants.value.map(p => p.userId))
  Object.keys(ringActive).forEach((k) => {
    if (!currentIds.has(k) && k !== liveKitRoom?.localParticipant.value?.identity) {
      ringActive[k] = false
    }
  })
}, { immediate: true })

const getRawLevel = (userId: string) => {
  const remote = liveKitRoom?.remoteParticipants.value.find(p => p.identity === userId)?.audioLevel ?? 0
  const local = (userId === liveKitRoom?.localParticipant.value?.identity) ? (liveKitRoom?.audioLevel.value ?? 0) : 0
  // audioLevel in composable is 0..100, convert to 0..1 and guard
  const raw = Math.max(remote, local) / 100
  return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0
}

const getSmoothedLevel = (userId: string) => smoothedLevels[userId] ?? 0

const getOuterRingStyle = (userId: string) => {
  const lvl = getSmoothedLevel(userId)
  return {
    transform: `scale(${1 + lvl * 0.9})`,
    opacity: Math.min(1, lvl * 0.98),
    willChange: 'transform, opacity'
  }
}

const getInnerRingStyle = (userId: string) => {
  const lvl = getSmoothedLevel(userId)
  return {
    transform: `scale(${1 + lvl * 0.55})`,
    opacity: Math.min(0.95, lvl * 0.9),
    willChange: 'transform, opacity'
  }
}

const getAvatarStyle = (userId: string) => {
  const raw = getRawLevel(userId)
  const mapped = Math.sqrt(raw)
  const scale = 1 + mapped * 0.9
  const opacity = 0.6 + mapped * 0.4
  return {
    transform: `scale(${scale})`,
    opacity,
    willChange: 'transform, opacity',
    transition: 'transform 40ms cubic-bezier(.22,.9,.4,1), opacity 100ms ease-out'
  }
}

const getCameraTrack = (userId: string) => liveKitRoom?.getVideoTrack(userId, 'camera')
const getScreenShareTrack = (userId: string) => liveKitRoom?.getVideoTrack(userId, 'screen_share')

const startSmoothingLoop = () => {
  // time constant in ms: around ~150ms gives a smooth but responsive feel
  const tau = 150

  // don't start multiple loops
  if (_raf) return

  let lastTs = performance.now()

  const loop = (ts: number) => {
    const dt = Math.max(0, ts - lastTs)
    lastTs = ts

    // convert to an alpha for this frame using exponential smoothing
    const alpha = 1 - Math.exp(-dt / tau)

    // update smoothedLevels for each participant we render
    videoParticipants.value.forEach((p) => {
      const id = p.userId
      const raw = getRawLevel(id)
      const prev = smoothedLevels[id] ?? 0
      smoothedLevels[id] = prev + (raw - prev) * alpha
    })

    // garbage collect any smoothed entries for participants no longer present
    // (avoid using `delete` to satisfy lint rules; set to 0 instead)
    const ids = new Set(videoParticipants.value.map(p => p.userId))
    Object.keys(smoothedLevels).forEach((k) => {
      if (!ids.has(k)) {
        smoothedLevels[k] = 0
      }
    })

    _raf = requestAnimationFrame(loop)
  }

  _raf = requestAnimationFrame(loop)
}

onMounted(() => {
  startSmoothingLoop()
})

onUnmounted(() => {
  if (_raf) cancelAnimationFrame(_raf)
  _raf = 0
})

// Update participants list based on LiveKit state
const updateParticipants = () => {
  const participants = []

  // Add local participant
  if (liveKitRoom?.localParticipant.value) {
    participants.push(liveKitRoom.localParticipant.value)
  }

  // Add remote participants
  if (liveKitRoom?.remoteParticipants.value) {
    participants.push(...liveKitRoom.remoteParticipants.value)
  }

  const newParticipants: typeof videoParticipants.value = []
  let index = 0

  participants
    .filter(p => !p.identity?.startsWith('ai-'))
    .forEach((p) => {
      const webcamId = `${p.identity}-webcam`
      const existingWebcam = videoParticipants.value.find(vp => vp.id === webcamId)
      const shouldShowWebcam = p.isCameraEnabled || p.isMicrophoneEnabled
      if (shouldShowWebcam) {
        newParticipants.push({
          id: webcamId,
          userId: p.identity,
          userName: p.name || p.identity,
          trackType: 'webcam',
          hasVideo: p.isCameraEnabled,
          hasAudio: p.isMicrophoneEnabled,
          x: existingWebcam?.x ?? (index % 2) * 6,
          y: existingWebcam?.y ?? Math.floor(index / 2) * 2,
          w: existingWebcam?.w ?? 6,
          h: existingWebcam?.h ?? 2
        })
        index++
      }

      if (p.isScreenShareEnabled) {
        const screenId = `${p.identity}-screen`
        const existingScreen = videoParticipants.value.find(vp => vp.id === screenId)
        newParticipants.push({
          id: screenId,
          userId: p.identity,
          userName: p.name || p.identity,
          trackType: 'screen',
          hasVideo: true,
          hasAudio: false,
          x: existingScreen?.x ?? (index % 2) * 6,
          y: existingScreen?.y ?? Math.floor(index / 2) * 2,
          w: existingScreen?.w ?? 6,
          h: existingScreen?.h ?? 2
        })
        index++
      }
    })

  // Remove participants no longer present
  const currentIds = new Set(newParticipants.map(p => p.id))
  videoParticipants.value.forEach((p) => {
    if (!currentIds.has(p.id)) {
      addedParticipants.delete(p.id)
    }
  })

  videoParticipants.value = newParticipants
}

// Watch LiveKit room state - use deep watch to catch property changes
watch([
  () => liveKitRoom?.localParticipant.value?.isCameraEnabled,
  () => liveKitRoom?.localParticipant.value?.isMicrophoneEnabled,
  () => liveKitRoom?.localParticipant.value?.isScreenShareEnabled,
  () => liveKitRoom?.remoteParticipants.value
], () => {
  updateParticipants()
}, { deep: true, immediate: false })

// Also watch remote participants deeply to catch isCameraEnabled/isScreenShareEnabled changes
watch(() => liveKitRoom?.remoteParticipants.value, () => {
  updateParticipants()
}, { deep: true, immediate: false })

// Initialize GridStack
onMounted(() => {
  updateParticipants()

  nextTick(() => {
    if (gridContainer.value) {
      grid = GridStack.init({
        cellHeight: 180,
        minRow: 1,
        float: true,
        margin: 12,
        column: 12,
        acceptWidgets: true
      }, gridContainer.value)
    }
  })
})

// Watch for new participants and add them to grid
watch(videoParticipants, (newParticipants) => {
  if (!grid) return

  nextTick(() => {
    newParticipants.forEach((participant) => {
      if (!addedParticipants.has(participant.id)) {
        const el = document.getElementById(`video-${participant.id}`)
        if (el) {
          grid!.makeWidget(el)
          addedParticipants.add(participant.id)
        }
      }
    })
  })
}, { deep: true })

// Handle video click for fullscreen
const handleVideoClick = (participantIdentity: string, trackType: 'webcam' | 'screen') => {
  const participant = videoParticipants.value.find(
    p => p.userId === participantIdentity && p.trackType === trackType
  )
  if (!participant) return

  const track = trackType === 'screen'
    ? liveKitRoom?.getVideoTrack(participantIdentity, 'screen_share')
    : liveKitRoom?.getVideoTrack(participantIdentity, 'camera')

  if (track) {
    selectedVideoTrack.value = track
    selectedParticipantName.value = participant.userName
    selectedParticipantIdentity.value = participantIdentity
    selectedTrackType.value = trackType as 'webcam' | 'screen'

    // Request high quality video for fullscreen viewing
    const source = trackType === 'screen' ? 'screen_share' : 'camera'
    liveKitRoom?.setVideoQuality(participantIdentity, VideoQuality.HIGH, source)

    isFullscreenOpen.value = true
  }
}

// Re-attach video track to original element when modal closes
watch(isFullscreenOpen, (isOpen) => {
  if (!isOpen && selectedParticipantIdentity.value) {
    // Restore video quality to LOW when closing fullscreen
    const source = selectedTrackType.value === 'screen' ? 'screen_share' : 'camera'
    liveKitRoom?.setVideoQuality(selectedParticipantIdentity.value, VideoQuality.LOW, source)

    // Wait a tick for the modal to fully close
    nextTick(() => {
      const refs = selectedTrackType.value === 'screen' ? screenRefs.value : webcamRefs.value
      const videoComponent = refs[selectedParticipantIdentity.value]

      if (videoComponent?.reattachTrack) {
        // Force re-attachment of the track to the original video element
        videoComponent.reattachTrack()
      }
    })
  }
})

// Cleanup
onUnmounted(() => {
  if (grid) {
    grid.destroy(false)
    grid = null
  }
})
</script>

<template>
  <div class="h-full w-full p-4 bg-default overflow-auto">
    <!-- Empty state overlay -->
    <div
      v-if="videoParticipants.length === 0"
      class="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
    >
      <UCard>
        <div class="text-center py-8">
          <UIcon name="i-lucide-video-off" class="w-12 h-12 mx-auto mb-4 text-muted" />
          <p class="text-muted">
            No video streams active
          </p>
          <p class="text-sm text-muted mt-2">
            Enable your camera or screen share to get started
          </p>
        </div>
      </UCard>
    </div>

    <!-- Grid is always rendered -->
    <div
      ref="gridContainer"
      class="grid-stack"
      :class="{ 'opacity-0': videoParticipants.length === 0 }"
    >
      <div
        v-for="participant in videoParticipants"
        :id="`video-${participant.id}`"
        :key="participant.id"
        class="grid-stack-item"
        :gs-x="participant.x"
        :gs-y="participant.y"
        :gs-w="participant.w"
        :gs-h="participant.h"
      >
        <div class="grid-stack-item-content p-2">
          <div
            class="relative w-full h-full bg-accented rounded-lg overflow-hidden transition-all duration-150"
            :class="{
              'ring-3 ring-primary': ringActive[participant.userId]
            }"
          >
            <template v-if="participant.trackType === 'webcam'">
              <VideoTrack
                v-if="participant.hasVideo"
                :ref="(el) => { if (el) webcamRefs[participant.userId] = el as VideoTrackInstance }"
                :track="getCameraTrack(participant.userId)"
                :participant-identity="participant.userId"
                :is-local="participant.userId === liveKitRoom?.localParticipant.value?.identity"
                :muted="participant.userId === liveKitRoom?.localParticipant.value?.identity"
                :class-name="'absolute inset-0 w-full h-full object-cover cursor-pointer'"
                @video-click="() => handleVideoClick(participant.userId, 'webcam')"
              />

              <div
                v-else
                class="absolute inset-0 w-full h-full flex items-center justify-center bg-gradient-to-br from-accented to-elevated"
              >
                <div class="relative">
                  <!-- Reactive pulsing rings based on audio level -->
                  <div
                    :style="getOuterRingStyle(participant.userId)"
                    class="absolute inset-0 rounded-full bg-neutral-500/40 transition-opacity duration-100 ease-out"
                  />
                  <div
                    :style="getInnerRingStyle(participant.userId)"
                    class="absolute inset-0 rounded-full bg-neutral-400/30 blur-md transition-opacity duration-140 ease-out"
                  />
                  <!-- Avatar with rapid, proportional scale -->
                  <img
                    :src="useDiceBearAvatar(participant.userName.toLowerCase()).value"
                    :alt="participant.userName"
                    :style="getAvatarStyle(participant.userId)"
                    class="w-32 h-32 rounded-full relative z-10"
                  >
                </div>
              </div>
            </template>

            <!-- Video Track for screen share -->
            <VideoTrack
              v-else-if="participant.trackType === 'screen'"
              :ref="(el) => { if (el) screenRefs[participant.userId] = el as VideoTrackInstance }"
              :track="getScreenShareTrack(participant.userId)"
              :participant-identity="participant.userId"
              :is-local="participant.userId === liveKitRoom?.localParticipant.value?.identity"
              :muted="participant.userId === liveKitRoom?.localParticipant.value?.identity"
              :class-name="'absolute inset-0 w-full h-full object-cover cursor-pointer'"
              @video-click="() => handleVideoClick(participant.userId, 'screen')"
            />

            <!-- Video Stats (only for video tracks) -->
            <VideoStats
              v-if="participant.hasVideo"
              :track="participant.trackType === 'screen'
                ? getScreenShareTrack(participant.userId)
                : getCameraTrack(participant.userId)"
              :is-local="participant.userId === liveKitRoom?.localParticipant.value?.identity"
              class="absolute bottom-2 left-2"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Fullscreen Video Modal -->
    <FullscreenVideoModal
      v-model:is-open="isFullscreenOpen"
      :track="selectedVideoTrack"
      :participant-name="selectedParticipantName"
      :participant-identity="selectedParticipantIdentity"
      :track-type="selectedTrackType"
    />
  </div>
</template>

<style scoped>
.grid-stack {
  background: transparent;
  min-height: 500px;
}

.grid-stack-item-content {
  cursor: move;
  overflow: hidden;
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Override gridstack default styles to match Nuxt UI theme */
:deep(.grid-stack > .grid-stack-item) {
  position: absolute;
}

:deep(.grid-stack > .grid-stack-item > .grid-stack-item-content) {
  inset: 0;
  position: absolute;
}

/* Remove default GridStack shadow from outer content */
:deep(.ui-draggable-dragging > .grid-stack-item-content),
:deep(.ui-resizable-resizing > .grid-stack-item-content) {
  box-shadow: none !important;
}

/* Apply shadow to inner rounded div instead */
:deep(.ui-draggable-dragging .grid-stack-item-content > div),
:deep(.ui-resizable-resizing .grid-stack-item-content > div) {
  box-shadow: 1px 4px 6px rgba(0, 0, 0, 0.2) !important;
}
</style>
