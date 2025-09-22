<script setup lang="ts">
const { setUserName } = useUser()
const loading = ref(false)

const state = reactive({
  name: ''
})

// No auto-redirect - users must enter name fresh each time

async function joinChat() {
  if (!state.name.trim()) return

  loading.value = true

  // Use the composable method to ensure proper state management
  setUserName(state.name.trim())

  await navigateTo('/chat')
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

          <UForm :state="state" class="space-y-4" @submit="joinChat">
            <UFormField label="Your Name" name="name" required>
              <UInput
                v-model="state.name"
                placeholder="Enter your name"
                size="lg"
                autofocus
                :disabled="loading"
                class="w-full"
              />
            </UFormField>

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
          </UForm>

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
