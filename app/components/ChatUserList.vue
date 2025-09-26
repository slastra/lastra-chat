<script setup lang="ts">
import type { UseLiveKitRoomReturn } from '../composables/useLiveKitRoom'
import type { UseLiveKitChatReturn } from '../composables/useLiveKitChat'
import type { RemoteVideoTrack, LocalVideoTrack } from 'livekit-client'
import type { ComponentPublicInstance } from 'vue'
import { VideoQuality } from 'livekit-client'

const liveKitRoom = inject('liveKitRoom') as UseLiveKitRoomReturn
const liveKitChat = inject('liveKitChat') as UseLiveKitChatReturn
const { bots, toggleBot, isBotEnabled } = useBots()

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

const sortedUsers = computed(() => {
  const users = []

  // Add local participant
  if (liveKitRoom?.localParticipant.value) {
    users.push(liveKitRoom.localParticipant.value)
  }

  // Add remote participants
  if (liveKitRoom?.remoteParticipants.value) {
    users.push(...liveKitRoom.remoteParticipants.value)
  }

  return users
    .filter(user => !user.identity?.startsWith('ai-')) // Filter out bots
    .map(user => ({
      userId: user.identity,
      userName: user.name || user.identity,
      mediaState: {
        webcam: user.isCameraEnabled,
        microphone: user.isMicrophoneEnabled,
        screen: user.isScreenShareEnabled
      },
      isTyping: liveKitChat?.typingUsers.value?.includes(user.name || user.identity) || false
    }))
    .sort((a, b) => a.userName.localeCompare(b.userName))
})

// Handle video click for fullscreen
const handleVideoClick = (participantIdentity: string, trackType: 'webcam' | 'screen') => {
  const user = sortedUsers.value.find(u => u.userId === participantIdentity)
  if (!user) return

  const track = trackType === 'screen'
    ? liveKitRoom?.getVideoTrack(participantIdentity, 'screen_share')
    : liveKitRoom?.getVideoTrack(participantIdentity, 'camera')

  if (track) {
    selectedVideoTrack.value = track
    selectedParticipantName.value = user.userName
    selectedParticipantIdentity.value = participantIdentity
    selectedTrackType.value = trackType

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
</script>

<template>
  <div class="h-full w-full overflow-y-auto">
    <div class="space-y-2 w-full">
      <div
        v-for="user in sortedUsers"
        :key="user.userId"
        class=" border rounded-lg border-accented bg-default/50 p-2"
      >
        <div class="flex items-center justify-between">
          <UUser
            :name="user.userName"
            :description="
              user.isTyping
                ? 'typing...'
                : user.userId === liveKitRoom?.localParticipant.value?.identity
                  ? 'You'
                  : user.userId?.startsWith('ai-')
                    ? 'AI Assistant'
                    : 'Active now'
            "
            :avatar="
              user.userId?.startsWith('ai-')
                ? {
                  icon: 'i-lucide-bot'
                }
                : {
                  text: user.userName.charAt(0).toUpperCase()
                }
            "
            size="sm"
          />

          <!-- Media Status Indicators -->
          <div class="flex items-center gap-1">
            <UIcon
              v-if="user.mediaState?.webcam"
              name="i-lucide-webcam"
              class="text-muted"
            />
            <UIcon
              v-if="user.mediaState?.microphone"
              name="i-lucide-mic"
              class="text-muted"
            />
            <UIcon
              v-if="user.mediaState?.screen"
              name="i-lucide-screen-share"
              class="text-muted"
            />
          </div>
        </div>

        <!-- Video streams using proper LiveKit track management -->
        <div v-if="user.mediaState?.webcam" class="mt-2 relative">
          <VideoTrack
            :ref="(el) => { if (el) webcamRefs[user.userId] = el as VideoTrackInstance }"
            :track="liveKitRoom?.getVideoTrack(user.userId, 'camera')"
            :participant-identity="user.userId"
            :is-local="user.userId === liveKitRoom?.localParticipant.value?.identity"
            class-name="w-full rounded bg-accented"
            @video-click="() => handleVideoClick(user.userId, 'webcam')"
          />
          <VideoStats
            :track="liveKitRoom?.getVideoTrack(user.userId, 'camera')"
            :is-local="user.userId === liveKitRoom?.localParticipant.value?.identity"
            class="absolute bottom-2 right-2"
          />
        </div>

        <div v-if="user.mediaState?.screen" class="mt-2 relative">
          <VideoTrack
            :ref="(el) => { if (el) screenRefs[user.userId] = el as VideoTrackInstance }"
            :track="liveKitRoom?.getVideoTrack(user.userId, 'screen_share')"
            :participant-identity="user.userId"
            :is-local="user.userId === liveKitRoom?.localParticipant.value?.identity"
            class-name="w-full rounded bg-accented"
            @video-click="() => handleVideoClick(user.userId, 'screen')"
          />
          <VideoStats
            :track="liveKitRoom?.getVideoTrack(user.userId, 'screen_share')"
            :is-local="user.userId === liveKitRoom?.localParticipant.value?.identity"
            class="absolute bottom-2 right-2"
          />
        </div>

        <!-- Audio track (invisible but necessary for audio playback) -->
        <!-- Don't render local participant's audio to prevent feedback -->

        <VideoTrack
          v-if="user.mediaState?.microphone && user.userId !== liveKitRoom?.localParticipant.value?.identity"
          :track="liveKitRoom?.getAudioTrack(user.userId)"
          :participant-identity="user.userId"
          :is-local="false"
          :muted="false"
        />
      </div>

      <div
        v-if="sortedUsers.length === 0"
        class="text-center py-8 text-sm text-neutral-500"
      >
        No users online
      </div>
      <USeparator class="my-4" />
      <!-- Bot Management Section -->
      <div v-if="bots.length > 0" class="">
        <div class="space-y-4">
          <div
            v-for="bot in bots"
            :key="bot.name"
            class="flex items-center justify-between"
          >
            <UUser
              :name="bot.name"
              :description="bot.role"
              :avatar="{
                icon: 'i-lucide-bot'
              }"
              size="sm"
            />
            <USwitch
              :model-value="isBotEnabled(bot.name)"
              size="sm"
              @update:model-value="toggleBot(bot.name)"
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
