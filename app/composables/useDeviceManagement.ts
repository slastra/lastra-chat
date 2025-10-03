import { Room } from 'livekit-client'

export function useDeviceManagement() {
  const cameras = ref<MediaDeviceInfo[]>([])
  const microphones = ref<MediaDeviceInfo[]>([])
  const speakers = ref<MediaDeviceInfo[]>([])
  const selectedCamera = ref<string | null>(null)
  const selectedMicrophone = ref<string | null>(null)
  const selectedSpeaker = ref<string | null>(null)

  // Browser support detection
  const supportsSpeakerSelection = computed(() => {
    if (!import.meta.client) return false
    // Check if setSinkId is available on HTMLMediaElement
    const testElement = document.createElement('audio')
    return 'setSinkId' in testElement
  })

  async function refreshDevices(): Promise<void> {
    try {
      const devices = await Room.getLocalDevices()

      cameras.value = devices.filter(d => d.kind === 'videoinput')
      microphones.value = devices.filter(d => d.kind === 'audioinput')
      speakers.value = devices.filter(d => d.kind === 'audiooutput')

      // Set default devices if none selected
      if (!selectedCamera.value && cameras.value.length > 0) {
        selectedCamera.value = cameras.value[0]?.deviceId || null
      }
      if (!selectedMicrophone.value && microphones.value.length > 0) {
        selectedMicrophone.value = microphones.value[0]?.deviceId || null
      }
      if (!selectedSpeaker.value && speakers.value.length > 0) {
        selectedSpeaker.value = speakers.value[0]?.deviceId || null
      }
    } catch (err) {
      console.error('[LiveKit] Failed to refresh devices:', err)
    }
  }

  async function switchCamera(room: Room | null, deviceId: string): Promise<void> {
    selectedCamera.value = deviceId
    if (room) {
      await room.switchActiveDevice('videoinput', deviceId)
    }
  }

  async function switchMicrophone(room: Room | null, deviceId: string, isMicrophoneEnabled: boolean): Promise<void> {
    selectedMicrophone.value = deviceId
    // Only switch active device if microphone is currently enabled
    // If disabled, the new device will be used next time it's enabled
    if (room && isMicrophoneEnabled) {
      await room.switchActiveDevice('audioinput', deviceId)
    }
  }

  async function switchSpeaker(room: Room | null, deviceId: string): Promise<void> {
    selectedSpeaker.value = deviceId
    if (room) {
      await room.switchActiveDevice('audiooutput', deviceId)
    }
  }

  return {
    cameras,
    microphones,
    speakers,
    selectedCamera,
    selectedMicrophone,
    selectedSpeaker,
    supportsSpeakerSelection,
    refreshDevices,
    switchCamera,
    switchMicrophone,
    switchSpeaker
  }
}
