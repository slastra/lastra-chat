<script setup lang="ts">
import type { SoundEvent } from '~/composables/useSoundManager'

const { enabled, volume, soundConfig, setSoundForEvent, resetToDefaults, availableSounds } = useSoundSettings()
const { playSound, canPlayAudio, enableAudio } = useSoundManager()

// Sound event labels for better UX
const soundEventLabels: Record<SoundEvent, string> = {
  messageReceived: 'Message Received',
  messageSent: 'Message Sent',
  aiResponse: 'AI Response',
  userJoined: 'User Joined',
  userLeft: 'User Left',
  error: 'Error',
  notification: 'Notification'
}

// Test a specific sound
const testSound = async (event: SoundEvent) => {
  if (!canPlayAudio.value) {
    await enableAudio()
  }
  playSound(event, volume.value)
}

// Handle volume change
const handleVolumeChange = (newVolume: number) => {
  volume.value = newVolume
}
</script>

<template>
  <div class="space-y-6">
    <!-- Enable/Disable Toggle -->
    <div class="flex items-center justify-between">
      <div>
        <h3 class="font-medium">
          Sound Notifications
        </h3>
        <p class="text-sm text-muted">
          Enable or disable sound effects
        </p>
      </div>
      <UToggle v-model="enabled" />
    </div>

    <!-- Audio Permission Warning -->
    <UAlert
      v-if="enabled && !canPlayAudio"
      icon="i-lucide-volume-x"
      color="warning"
      title="Audio Permission Required"
      description="Click here to enable audio notifications"
      class="cursor-pointer"
      @click="enableAudio"
    />

    <!-- Volume Control -->
    <div v-if="enabled" class="space-y-2">
      <div class="flex items-center justify-between">
        <label class="text-sm font-medium">Volume</label>
        <span class="text-sm text-muted">{{ Math.round(volume * 100) }}%</span>
      </div>
      <USlider
        v-model="volume"
        :min="0"
        :max="1"
        :step="0.1"
        class="w-full"
        @update:model-value="(val) => handleVolumeChange(val as number)"
      />
    </div>

    <!-- Sound Mappings -->
    <div v-if="enabled" class="space-y-4">
      <h4 class="font-medium">
        Sound Effects
      </h4>

      <div class="space-y-3">
        <div
          v-for="(event, eventKey) in soundEventLabels"
          :key="eventKey"
          class="flex items-center justify-between gap-3"
        >
          <div class="flex-1">
            <label class="text-sm font-medium">{{ event }}</label>
          </div>

          <div class="flex items-center gap-2">
            <!-- Sound Selection -->
            <USelect
              v-model="soundConfig[eventKey as SoundEvent]"
              :items="availableSounds"
              class="w-40"
              @update:model-value="(value: string) => setSoundForEvent(eventKey as SoundEvent, value)"
            />

            <!-- Test Button -->
            <UButton
              icon="i-lucide-play"
              size="sm"
              color="neutral"
              variant="ghost"
              @click="testSound(eventKey as SoundEvent)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Reset Button -->
    <div v-if="enabled" class="pt-4 border-t border-default">
      <UButton
        variant="outline"
        color="neutral"
        size="sm"
        @click="resetToDefaults"
      >
        Reset to Defaults
      </UButton>
    </div>
  </div>
</template>
