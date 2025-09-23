<script setup lang="ts">
import { useDevicesList } from '@vueuse/core'

const props = defineProps<{
  webcamEnabled: boolean
  micEnabled: boolean
  screenEnabled: boolean
  selectedCamera?: string
  selectedMicrophone?: string
  selectedSpeaker?: string
  supportsSpeakerSelection?: boolean
}>()

const emit = defineEmits<{
  webcamToggle: []
  micToggle: []
  screenToggle: []
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

// Selected devices - use props if provided, otherwise internal state
const internalSelectedCamera = ref<string>('')
const internalSelectedMicrophone = ref<string>('')
const internalSelectedSpeaker = ref<string>('')

// Use props if provided, otherwise internal state
const selectedCamera = computed(() => props.selectedCamera ?? internalSelectedCamera.value)
const selectedMicrophone = computed(() => props.selectedMicrophone ?? internalSelectedMicrophone.value)
const selectedSpeaker = computed(() => props.selectedSpeaker ?? internalSelectedSpeaker.value)

// Handler functions (defined outside computed for proper reference)
const handleMicToggle = () => {
  emit('micToggle')
}

const handleWebcamToggle = () => {
  emit('webcamToggle')
}

const handleScreenToggle = () => {
  emit('screenToggle')
}

const selectMicrophone = (deviceId: string) => {
  internalSelectedMicrophone.value = deviceId
  emit('deviceChange', 'audioInput', deviceId)
}

const selectSpeaker = (deviceId: string) => {
  internalSelectedSpeaker.value = deviceId
  emit('deviceChange', 'audioOutput', deviceId)
}

const selectCamera = (deviceId: string) => {
  internalSelectedCamera.value = deviceId
  emit('deviceChange', 'videoInput', deviceId)
}

// Build menu items dynamically
const menuItems = computed(() => {
  const items = []

  // Main toggles section with checkboxes
  items.push([
    {
      label: 'Microphone',
      icon: 'i-lucide-mic',
      type: 'checkbox',
      checked: props.micEnabled,
      onUpdateChecked: handleMicToggle,
      shortcuts: ['M']
    },
    {
      label: 'Webcam',
      icon: 'i-lucide-video',
      type: 'checkbox',
      checked: props.webcamEnabled,
      onUpdateChecked: handleWebcamToggle,
      shortcuts: ['W']
    },
    {
      label: 'Share Screen',
      icon: 'i-lucide-monitor',
      type: 'checkbox',
      checked: props.screenEnabled,
      onUpdateChecked: handleScreenToggle,
      shortcuts: ['S']
    }
  ])

  // Build settings menu items
  const settingsItems = []

  // Audio Settings nested menu
  const audioSettings = []

  // Audio Input submenu
  if (microphones.value.length > 0) {
    const audioInputChildren = microphones.value.map(mic => ({
      label: mic.label || `Microphone ${mic.deviceId.slice(0, 8)}`,
      type: 'checkbox',
      checked: selectedMicrophone.value === mic.deviceId,
      onUpdateChecked: () => selectMicrophone(mic.deviceId)
    }))

    audioSettings.push({
      label: 'Audio Input',
      icon: 'i-lucide-mic',
      children: [[...audioInputChildren]]
    })
  }

  // Audio Output submenu - only show if browser supports speaker selection
  if (speakers.value.length > 0 && props.supportsSpeakerSelection) {
    const audioOutputChildren = speakers.value.map(speaker => ({
      label: speaker.label || `Speaker ${speaker.deviceId.slice(0, 8)}`,
      type: 'checkbox',
      checked: selectedSpeaker.value === speaker.deviceId,
      onUpdateChecked: () => selectSpeaker(speaker.deviceId)
    }))

    audioSettings.push({
      label: 'Audio Output',
      icon: 'i-lucide-volume-2',
      children: [[...audioOutputChildren]]
    })
  }

  // Add Audio Settings if we have any audio devices
  if (audioSettings.length > 0) {
    settingsItems.push({
      label: 'Audio Settings',
      icon: 'i-lucide-settings',
      children: [audioSettings]
    })
  }

  // Video Settings nested menu
  if (cameras.value.length > 0) {
    const videoChildren = cameras.value.map(cam => ({
      label: cam.label || `Camera ${cam.deviceId.slice(0, 8)}`,
      type: 'checkbox',
      checked: selectedCamera.value === cam.deviceId,
      onUpdateChecked: () => selectCamera(cam.deviceId)
    }))

    settingsItems.push({
      label: 'Video Settings',
      icon: 'i-lucide-video',
      children: [[...videoChildren]]
    })
  }

  // Add settings items as a single group if there are any
  if (settingsItems.length > 0) {
    items.push(settingsItems)
  }

  return items
})

// Watch for device list changes and select defaults
watchEffect(() => {
  // Helper function to select default device
  const selectDefaultDevice = (
    devices: MediaDeviceInfo[],
    currentSelection: string,
    propSelection: string | null | undefined,
    deviceType: 'videoInput' | 'audioInput' | 'audioOutput',
    setter: (value: string) => void
  ) => {
    if (devices.length > 0 && !currentSelection && !propSelection) {
      const defaultDevice = devices.find(
        device => device.label && device.label.includes('Default')
      )
      const defaultId = defaultDevice?.deviceId || devices[0]?.deviceId || ''
      setter(defaultId)
      // Emit the default selection
      if (defaultId) {
        emit('deviceChange', deviceType, defaultId)
      }
    }
  }

  // Select defaults for all device types
  selectDefaultDevice(
    cameras.value,
    internalSelectedCamera.value,
    props.selectedCamera,
    'videoInput',
    (id) => { internalSelectedCamera.value = id }
  )

  selectDefaultDevice(
    microphones.value,
    internalSelectedMicrophone.value,
    props.selectedMicrophone,
    'audioInput',
    (id) => { internalSelectedMicrophone.value = id }
  )

  selectDefaultDevice(
    speakers.value,
    internalSelectedSpeaker.value,
    props.selectedSpeaker,
    'audioOutput',
    (id) => { internalSelectedSpeaker.value = id }
  )
})
</script>

<template>
  <UDropdownMenu :items="menuItems">
    <UButton
      color="primary"
      label="Streaming"
      icon="i-lucide-audio-waveform"
      block
    />
  </UDropdownMenu>
</template>
