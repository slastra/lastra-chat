<script setup lang="ts">
import { useDevicesList } from '@vueuse/core'

const props = defineProps<{
  webcamEnabled: boolean
  micEnabled: boolean
  screenEnabled: boolean
  screenShareQuality?: 'gaming' | 'presentation' | 'balanced' | 'bandwidth'
}>()

const emit = defineEmits<{
  webcamToggle: []
  micToggle: []
  screenToggle: []
  deviceChange: [type: 'video' | 'audio', deviceId: string]
  screenQualityChange: [quality: 'gaming' | 'presentation' | 'balanced' | 'bandwidth']
}>()

// Device management
const {
  videoInputs: cameras,
  audioInputs: microphones
} = useDevicesList({
  requestPermissions: false
})

// Use props for media states instead of local refs

// Selected devices
const selectedCamera = ref<string>('')
const selectedMicrophone = ref<string>('')

// Device options for dropdowns
const cameraOptions = computed(() =>
  cameras.value.map(cam => ({
    label: cam.label || `Camera ${cam.deviceId.slice(0, 8)}`,
    value: cam.deviceId
  }))
)

const microphoneOptions = computed(() =>
  microphones.value.map(mic => ({
    label: mic.label || `Microphone ${mic.deviceId.slice(0, 8)}`,
    value: mic.deviceId
  }))
)

// Toggle functions - just emit events, parent controls state
const toggleWebcam = () => {
  emit('webcamToggle')
}

const toggleMic = () => {
  emit('micToggle')
}

const toggleScreen = () => {
  emit('screenToggle')
}

// Screen share quality options
const screenQualityOptions = [
  { label: 'Gaming (60 FPS)', value: 'gaming', description: 'Best for games and high-motion content' },
  { label: 'Balanced (30 FPS)', value: 'balanced', description: 'Good for most use cases' },
  { label: 'Presentation (15 FPS)', value: 'presentation', description: 'Optimized for static content' },
  { label: 'Bandwidth Saver', value: 'bandwidth', description: '720p 15 FPS for low bandwidth' }
]

const selectScreenQuality = (quality: 'gaming' | 'presentation' | 'balanced' | 'bandwidth') => {
  emit('screenQualityChange', quality)
}

// Device selection
const selectCamera = (deviceId: string) => {
  selectedCamera.value = deviceId
  emit('deviceChange', 'video', deviceId)
}

const selectMicrophone = (deviceId: string) => {
  selectedMicrophone.value = deviceId
  emit('deviceChange', 'audio', deviceId)
}

// Initialize default devices
onMounted(() => {
  if (cameras.value.length > 0 && !selectedCamera.value) {
    selectedCamera.value = cameras.value[0]?.deviceId || ''
  }
  if (microphones.value.length > 0 && !selectedMicrophone.value) {
    selectedMicrophone.value = microphones.value[0]?.deviceId || ''
  }
})
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Webcam Control -->
    <UDropdownMenu
      :items="[
        [{
          label: 'Select Camera',
          disabled: true
        }],
        cameraOptions.map(opt => ({
          label: opt.label,
          click: () => selectCamera(opt.value),
          icon: selectedCamera === opt.value ? 'i-lucide-check' : undefined
        }))
      ]"
      :disabled="cameraOptions.length === 0"
    >
      <UButton
        :color="props.webcamEnabled ? 'primary' : 'neutral'"
        :variant="props.webcamEnabled ? 'solid' : 'ghost'"
        :icon="props.webcamEnabled ? 'i-lucide-video' : 'i-lucide-video-off'"
        size="sm"
        square
        @click="toggleWebcam"
      />
    </UDropdownMenu>

    <!-- Microphone Control -->
    <UDropdownMenu
      :items="[
        [{
          label: 'Select Microphone',
          disabled: true
        }],
        microphoneOptions.map(opt => ({
          label: opt.label,
          click: () => selectMicrophone(opt.value),
          icon: selectedMicrophone === opt.value ? 'i-lucide-check' : undefined
        }))
      ]"
      :disabled="microphoneOptions.length === 0"
    >
      <UButton
        :color="props.micEnabled ? 'primary' : 'neutral'"
        :variant="props.micEnabled ? 'solid' : 'ghost'"
        :icon="props.micEnabled ? 'i-lucide-mic' : 'i-lucide-mic-off'"
        size="sm"
        square
        @click="toggleMic"
      />
    </UDropdownMenu>

    <!-- Screen Share Control -->
    <UDropdownMenu
      :items="[
        [{
          label: 'Screen Share Quality',
          disabled: true
        }],
        screenQualityOptions.map(opt => ({
          label: opt.label,
          description: opt.description,
          click: () => selectScreenQuality(opt.value as 'gaming' | 'presentation' | 'balanced' | 'bandwidth'),
          icon: props.screenShareQuality === opt.value ? 'i-lucide-check' : undefined
        }))
      ]"
    >
      <UButton
        :color="props.screenEnabled ? 'primary' : 'neutral'"
        :variant="props.screenEnabled ? 'solid' : 'ghost'"
        :icon="props.screenEnabled ? 'i-lucide-monitor-up' : 'i-lucide-monitor'"
        size="sm"
        square
        @click="toggleScreen"
      />
    </UDropdownMenu>
  </div>
</template>
