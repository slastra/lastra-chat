<script setup lang="ts">
import { useDevicesList } from '@vueuse/core'

const props = defineProps<{
  selectedCamera?: string
  selectedMicrophone?: string
  selectedSpeaker?: string
  supportsSpeakerSelection?: boolean
}>()

const emit = defineEmits<{
  deviceChange: [
    type: 'videoInput' | 'audioInput' | 'audioOutput',
    deviceId: string
  ]
}>()

// Device management
const {
  videoInputs: cameras,
  audioInputs: microphones,
  audioOutputs: speakers
} = useDevicesList({
  requestPermissions: false
})

// Selected devices - computed from props (always use LiveKit's selected device)
const internalSelectedCamera = computed({
  get: () => props.selectedCamera || '',
  set: (val) => { if (val) emit('deviceChange', 'videoInput', val) }
})

const internalSelectedMicrophone = computed({
  get: () => props.selectedMicrophone || '',
  set: (val) => { if (val) emit('deviceChange', 'audioInput', val) }
})

const internalSelectedSpeaker = computed({
  get: () => props.selectedSpeaker || '',
  set: (val) => { if (val) emit('deviceChange', 'audioOutput', val) }
})
</script>

<template>
  <div class="space-y-6 w-full">
    <!-- Camera Selection -->
    <UFormField v-if="cameras.length > 0" label="Camera" class="w-full">
      <USelect
        v-model="internalSelectedCamera"
        :items="cameras.map(cam => ({ value: cam.deviceId, label: cam.label || `Camera ${cam.deviceId.slice(0, 8)}` }))"
        value-key="value"
        placeholder="Select camera"
        class="w-full"
      />
    </UFormField>

    <!-- Microphone Selection -->
    <UFormField v-if="microphones.length > 0" label="Microphone" class="w-full">
      <USelect
        v-model="internalSelectedMicrophone"
        :items="microphones.map(mic => ({ value: mic.deviceId, label: mic.label || `Microphone ${mic.deviceId.slice(0, 8)}` }))"
        value-key="value"
        placeholder="Select microphone"
        class="w-full"
      />
    </UFormField>

    <!-- Speaker Selection -->
    <UFormField v-if="speakers.length > 0 && supportsSpeakerSelection" label="Speaker" class="w-full">
      <USelect
        v-model="internalSelectedSpeaker"
        :items="speakers.map(speaker => ({ value: speaker.deviceId, label: speaker.label || `Speaker ${speaker.deviceId.slice(0, 8)}` }))"
        value-key="value"
        placeholder="Select speaker"
        class="w-full"
      />
    </UFormField>
  </div>
</template>
