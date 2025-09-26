<script setup lang="ts">
const { setUserName, clientId } = useUser()
const loading = ref(false)
const error = ref('')
const suggestions = ref<string[]>([])

const state = reactive({
  name: ''
})

// No auto-redirect - users must enter name fresh each time

async function validateAndJoin() {
  if (!state.name.trim()) return

  loading.value = true
  error.value = ''
  suggestions.value = []

  try {
    // Validate username availability
    const validation = await $fetch('/api/validate-username', {
      method: 'POST',
      body: {
        roomName: 'main-chat-room',
        username: state.name.trim(),
        clientId: clientId.value
      }
    })

    if (!validation.valid) {
      error.value = validation.message || 'Username is not available'
      suggestions.value = ('suggestions' in validation && validation.suggestions) ? validation.suggestions : []
      loading.value = false
      return
    }

    // Username is valid, proceed to join
    setUserName(state.name.trim())
    await navigateTo('/chat')
  } catch (err) {
    console.error('Failed to validate username:', err)
    error.value = 'Failed to check username availability. Please try again.'
    loading.value = false
  }
}

function useSuggestion(suggestion: string) {
  state.name = suggestion
  error.value = ''
  suggestions.value = []
}
</script>

<template>
  <UDashboardPanel id="home" :ui="{ body: 'p-0 sm:p-0' }">
    <template #body>
      <UContainer class="flex-1 flex flex-col justify-center items-center py-8">
        <UCard class="w-full max-w-xs" variant="subtle">
          <template #header>
            <h1 class="text-2xl font-bold text-center">
              Lastra Chat
            </h1>
          </template>

          <form class="space-y-4" @submit.prevent="validateAndJoin">
            <UFormField
              label="Your Name"
              :error="error || undefined"
            >
              <UInput
                v-model="state.name"
                placeholder="Enter your name"
                size="lg"
                autofocus
                :disabled="loading"
                class="w-full"
                @input="error = ''"
                @keydown.enter="validateAndJoin"
              />
            </UFormField>

            <!-- Show username suggestions -->
            <div v-if="suggestions.length > 0" class="space-y-2">
              <p class="text-sm text-muted">
                Try one of these available names:
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="suggestion in suggestions"
                  :key="suggestion"
                  size="xs"
                  variant="subtle"
                  @click="useSuggestion(suggestion)"
                >
                  {{ suggestion }}
                </UButton>
              </div>
            </div>

            <UButton
              type="submit"
              color="primary"
              size="lg"
              block
              :loading="loading"
              :disabled="!state.name.trim()"
            >
              Join Chat
            </UButton>
          </form>

          <template #footer>
            <p class="text-sm text-neutral text-center">
              Enter your name
            </p>
          </template>
        </UCard>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
