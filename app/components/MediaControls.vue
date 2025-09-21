<script setup lang="ts">
import { useDevicesList } from '@vueuse/core'

const emit = defineEmits<{
  webcamToggle: [enabled: boolean]
  micToggle: [enabled: boolean]
  screenToggle: [enabled: boolean]
  deviceChange: [type: 'video' | 'audio', deviceId: string]
}>()

// Device management
const {
  videoInputs: cameras,
  audioInputs: microphones
} = useDevicesList({
  requestPermissions: false
})

// Media states
const webcamEnabled = ref(false)
const micEnabled = ref(false)
const screenEnabled = ref(false)

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

// Toggle functions
const toggleWebcam = () => {
  webcamEnabled.value = !webcamEnabled.value
  emit('webcamToggle', webcamEnabled.value)
}

const toggleMic = () => {
  micEnabled.value = !micEnabled.value
  emit('micToggle', micEnabled.value)
}

const toggleScreen = () => {
  screenEnabled.value = !screenEnabled.value
  emit('screenToggle', screenEnabled.value)
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
        :color="webcamEnabled ? 'primary' : 'neutral'"
        :variant="webcamEnabled ? 'solid' : 'ghost'"
        :icon="webcamEnabled ? 'i-lucide-video' : 'i-lucide-video-off'"
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
        :color="micEnabled ? 'primary' : 'neutral'"
        :variant="micEnabled ? 'solid' : 'ghost'"
        :icon="micEnabled ? 'i-lucide-mic' : 'i-lucide-mic-off'"
        size="sm"
        square
        @click="toggleMic"
      />
    </UDropdownMenu>

    <!-- Screen Share Control -->
    <UButton
      :color="screenEnabled ? 'primary' : 'neutral'"
      :variant="screenEnabled ? 'solid' : 'ghost'"
      :icon="screenEnabled ? 'i-lucide-monitor-up' : 'i-lucide-monitor'"
      size="sm"
      square
      @click="toggleScreen"
    />
  </div>
</template>
