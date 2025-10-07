<script setup lang="ts">
import { useDevicesList } from '@vueuse/core'
import type { IngressInfo } from '#shared/types/ingress'

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

// WHIP Ingress management
const ingressInfo = ref<IngressInfo | null>(null)
const isLoadingIngress = ref(false)
const ingressError = ref<string | null>(null)
const showOBSInstructions = ref(false)
const toast = useToast()

// Load or create WHIP ingress on mount
onMounted(async () => {
  isLoadingIngress.value = true
  ingressError.value = null

  try {
    const response = await $fetch('/api/whip-ingress', {
      method: 'POST',
      body: {
        roomName: 'main-chat-room'
      }
    })

    ingressInfo.value = response.ingress
  } catch (error) {
    console.error('[Settings] Failed to create WHIP ingress:', error)
    ingressError.value = 'Failed to create ingress. Ensure LiveKit server has ingress service enabled.'
  } finally {
    isLoadingIngress.value = false
  }
})

// Copy to clipboard helper
const copyToClipboard = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({
      title: 'Copied',
      description: `${label} copied to clipboard`,
      icon: 'i-lucide-check',
      color: 'success'
    })
  } catch (error) {
    console.error('[Settings] Failed to copy to clipboard:', error)
    toast.add({
      title: 'Error',
      description: 'Failed to copy to clipboard',
      icon: 'i-lucide-x',
      color: 'error'
    })
  }
}
</script>

<template>
  <div class="space-y-6 w-full">
    <!-- Device Settings Section -->
    <div class="space-y-4">
      <h3 class="text-lg font-semibold">
        Devices
      </h3>

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

    <USeparator />

    <!-- OBS Streaming Section -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">
          OBS Streaming (WHIP)
        </h3>
        <UButton
          v-if="ingressInfo"
          variant="ghost"
          color="neutral"
          :icon="showOBSInstructions ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          @click="showOBSInstructions = !showOBSInstructions"
        >
          {{ showOBSInstructions ? 'Hide' : 'Show' }} Instructions
        </UButton>
      </div>

      <!-- Loading State -->
      <div v-if="isLoadingIngress" class="flex items-center gap-2 text-muted">
        <UIcon name="i-lucide-loader-2" class="animate-spin" />
        <span>Loading ingress configuration...</span>
      </div>

      <!-- Error State -->
      <UAlert
        v-else-if="ingressError"
        color="error"
        variant="subtle"
        :title="ingressError"
        icon="i-lucide-alert-circle"
      />

      <!-- Ingress Info -->
      <div v-else-if="ingressInfo" class="space-y-4">
        <p class="text-sm text-muted">
          Use these credentials to stream from OBS to the chat room.
        </p>

        <!-- Server URL -->
        <UFormField label="Server URL" class="w-full">
          <div class="flex gap-2">
            <UInput
              :model-value="ingressInfo.url"
              readonly
              class="flex-1 font-mono text-sm"
            />
            <UButton
              icon="i-lucide-copy"
              color="neutral"
              variant="ghost"
              @click="copyToClipboard(ingressInfo.url, 'Server URL')"
            />
          </div>
        </UFormField>

        <!-- Stream Key -->
        <UFormField label="Stream Key" class="w-full">
          <div class="flex gap-2">
            <UInput
              :model-value="ingressInfo.streamKey"
              type="password"
              readonly
              class="flex-1 font-mono text-sm"
            />
            <UButton
              icon="i-lucide-copy"
              color="neutral"
              variant="ghost"
              @click="copyToClipboard(ingressInfo.streamKey, 'Stream Key')"
            />
          </div>
        </UFormField>

        <!-- OBS Setup Instructions -->
        <UCard v-if="showOBSInstructions" :ui="{ body: 'p-4' }">
          <div class="space-y-3 text-sm">
            <h4 class="font-semibold">
              OBS Studio Setup
            </h4>
            <ol class="list-decimal list-inside space-y-2 text-muted">
              <li>Open OBS Studio</li>
              <li>Go to <strong>Settings → Stream</strong></li>
              <li>Select <strong>"WHIP"</strong> as the Service (requires OBS 30+)</li>
              <li>Paste the <strong>Server URL</strong> into the "Server" field</li>
              <li>Paste the <strong>Stream Key</strong> into the "Bearer Token" field</li>
              <li>Click <strong>OK</strong> and start streaming</li>
            </ol>
            <p class="text-xs text-muted mt-3">
              <strong>Note:</strong> WHIP requires OBS Studio 30 or newer.
            </p>
            <p class="text-xs text-muted mt-3">
              Your OBS stream will appear in the video grid for all participants.
            </p>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>
