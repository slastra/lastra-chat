<script setup lang="ts">
interface FileUpload {
  url: string
  originalName: string
  mimeType: string
  size: number
  type: string
  uploadedAt: string
}

interface UploadResponse {
  success: boolean
  files: FileUpload[]
}

const emit = defineEmits<{
  filesUploaded: [files: FileUpload[]]
}>()

const isModalOpen = ref(false)
const selectedFiles = ref<File[]>([])
const isUploading = ref(false)
const uploadProgress = ref(0)

const acceptedTypes = [
  'image/*',
  'audio/*',
  'video/*',
  '.pdf',
  '.doc',
  '.docx',
  '.txt',
  '.md',
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.gz'
].join(',')

const uploadFiles = async () => {
  if (selectedFiles.value.length === 0) return

  isUploading.value = true
  uploadProgress.value = 0

  try {
    const formData = new FormData()
    selectedFiles.value.forEach((file) => {
      formData.append('files', file)
    })

    // Simulate progress (since we don't have real progress from the server)
    const progressInterval = setInterval(() => {
      if (uploadProgress.value < 90) {
        uploadProgress.value += Math.random() * 20
      }
    }, 200)

    const response = await $fetch<UploadResponse>('/api/upload', {
      method: 'POST',
      body: formData
    })

    clearInterval(progressInterval)
    uploadProgress.value = 100

    if (response.success) {
      emit('filesUploaded', response.files)

      // Show success toast
      const toast = useToast()
      toast.add({
        title: 'Files uploaded successfully',
        description: `${response.files.length} file(s) uploaded`,
        color: 'success'
      })

      // Reset and close modal
      selectedFiles.value = []
      isModalOpen.value = false
    }
  } catch (error) {
    console.error('[FileUpload] Upload failed:', error)

    const toast = useToast()
    toast.add({
      title: 'Upload failed',
      description: (error as { data?: { message?: string } }).data?.message || 'Failed to upload files',
      color: 'error'
    })
  } finally {
    isUploading.value = false
    uploadProgress.value = 0
  }
}

const closeModal = () => {
  if (!isUploading.value) {
    isModalOpen.value = false
    selectedFiles.value = []
    uploadProgress.value = 0
  }
}
</script>

<template>
  <UModal
    v-model:open="isModalOpen"
    :dismissible="!isUploading"
    title="Upload Files"
    description="Select and upload files to share in the chat"
  >
    <UButton
      icon="i-lucide-paperclip"
      variant="ghost"
      color="neutral"
    />

    <template #content>
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold">
              Upload Files
            </h3>
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              color="neutral"
              size="sm"
              :disabled="isUploading"
              @click="closeModal"
            />
          </div>
        </template>

        <div class="space-y-4">
          <!-- File Upload Area -->
          <UFileUpload
            v-if="!isUploading"
            v-model="selectedFiles"
            :accept="acceptedTypes"
            icon="i-lucide-paperclip"
            label="Drop your files here"
            description="Images, videos, audio, documents or archives (max 100MB)"
            layout="list"
            multiple
            :interactive="false"
            class="w-full min-h-32"
          >
            <template #actions="{ open }">
              <UButton
                label="Select files"
                icon="i-lucide-folder-open"
                color="primary"
                variant="outline"
                @click="open()"
              />
            </template>
          </UFileUpload>

          <!-- Selected Files List -->

          <!-- Upload Progress -->
          <div v-if="isUploading" class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-sm">Uploading...</span>
              <span class="text-sm text-muted">{{ Math.round(uploadProgress) }}%</span>
            </div>
            <UProgress :value="uploadProgress" color="primary" />
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              variant="outline"
              color="neutral"
              :disabled="isUploading"
              @click="closeModal"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :disabled="selectedFiles.length === 0 || isUploading"
              :loading="isUploading"
              @click="uploadFiles"
            >
              Upload {{ selectedFiles.length > 0 ? `(${selectedFiles.length})` : '' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>
