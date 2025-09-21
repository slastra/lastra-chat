<script setup lang="ts">
const {
  connectionState,
  iceGatheringState,
  iceCandidates,
  testResults,
  testConnection,
  forceRelayTest
} = useTurnTest()

const isLoading = ref(false)

const runTest = async () => {
  isLoading.value = true
  await testConnection()
  setTimeout(() => {
    isLoading.value = false
  }, 5000) // Give it 5 seconds to gather candidates
}

const runRelayTest = async () => {
  isLoading.value = true
  await forceRelayTest()
  setTimeout(() => {
    isLoading.value = false
  }, 5000)
}

// Group candidates by type for better display
const candidatesByType = computed(() => {
  const grouped = {
    host: [] as RTCIceCandidate[],
    srflx: [] as RTCIceCandidate[],
    relay: [] as RTCIceCandidate[],
    prflx: [] as RTCIceCandidate[]
  }

  iceCandidates.value.forEach((candidate) => {
    const type = candidate.type || 'host'
    if (type in grouped) {
      grouped[type as keyof typeof grouped].push(candidate)
    }
  })

  return grouped
})

const candidateTypeInfo = {
  host: { label: 'Host', icon: 'i-lucide-home', color: 'blue', description: 'Local network addresses' },
  srflx: { label: 'Server Reflexive (STUN)', icon: 'i-lucide-globe', color: 'green', description: 'Public IP via STUN' },
  relay: { label: 'Relay (TURN)', icon: 'i-lucide-server', color: 'purple', description: 'Relayed through TURN' },
  prflx: { label: 'Peer Reflexive', icon: 'i-lucide-users', color: 'yellow', description: 'Discovered from peer' }
}
</script>

<template>
  <div class="min-h-screen bg-surface p-8">
    <UContainer>
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-2xl font-bold">
                TURN Server Connection Test
              </h1>
              <p class="text-sm text-muted-foreground mt-1">
                Testing connection to turn.lastra.us
              </p>
            </div>
            <UButton
              icon="i-lucide-arrow-left"
              variant="ghost"
              color="neutral"
              to="/chat"
            >
              Back to Chat
            </UButton>
          </div>
        </template>

        <!-- Test Controls -->
        <div class="space-y-6">
          <div class="flex gap-4">
            <UButton
              icon="i-lucide-play"
              size="lg"
              :loading="isLoading"
              :disabled="isLoading"
              @click="runTest"
            >
              Run Full Test
            </UButton>
            <UButton
              icon="i-lucide-server"
              size="lg"
              variant="outline"
              :loading="isLoading"
              :disabled="isLoading"
              @click="runRelayTest"
            >
              Test TURN Relay Only
            </UButton>
          </div>

          <!-- Connection Status -->
          <div class="grid grid-cols-2 gap-4">
            <UCard>
              <div class="space-y-2">
                <div class="text-sm font-medium text-muted-foreground">
                  Connection State
                </div>
                <div class="flex items-center gap-2">
                  <UBadge
                    :color="connectionState === 'connected' ? 'success' : connectionState === 'connecting' ? 'warning' : 'neutral'"
                    variant="subtle"
                  >
                    {{ connectionState }}
                  </UBadge>
                </div>
              </div>
            </UCard>

            <UCard>
              <div class="space-y-2">
                <div class="text-sm font-medium text-muted-foreground">
                  ICE Gathering State
                </div>
                <div class="flex items-center gap-2">
                  <UBadge
                    :color="iceGatheringState === 'complete' ? 'success' : iceGatheringState === 'gathering' ? 'warning' : 'neutral'"
                    variant="subtle"
                  >
                    {{ iceGatheringState }}
                  </UBadge>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Test Results -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">
                Test Results
              </h3>
            </template>

            <div class="space-y-4">
              <!-- Service Status -->
              <div class="grid grid-cols-3 gap-4">
                <div class="flex items-center justify-between p-3 rounded-lg border">
                  <span class="font-medium">STUN</span>
                  <UIcon
                    :name="testResults.stun ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
                    :class="testResults.stun ? 'text-success' : 'text-muted-foreground'"
                    class="w-5 h-5"
                  />
                </div>
                <div class="flex items-center justify-between p-3 rounded-lg border">
                  <span class="font-medium">TURN</span>
                  <UIcon
                    :name="testResults.turn ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
                    :class="testResults.turn ? 'text-success' : 'text-muted-foreground'"
                    class="w-5 h-5"
                  />
                </div>
                <div class="flex items-center justify-between p-3 rounded-lg border">
                  <span class="font-medium">Relay</span>
                  <UIcon
                    :name="testResults.relay ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
                    :class="testResults.relay ? 'text-success' : 'text-muted-foreground'"
                    class="w-5 h-5"
                  />
                </div>
              </div>

              <!-- Errors -->
              <div v-if="testResults.errors.length > 0" class="space-y-2">
                <h4 class="text-sm font-medium text-error">
                  Errors:
                </h4>
                <UAlert
                  v-for="(error, index) in testResults.errors"
                  :key="index"
                  color="error"
                  variant="subtle"
                  :description="error"
                />
              </div>
            </div>
          </UCard>

          <!-- ICE Candidates -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold">
                  ICE Candidates
                </h3>
                <UBadge variant="subtle">
                  {{ iceCandidates.length }} total
                </UBadge>
              </div>
            </template>

            <div class="space-y-4">
              <div v-for="(candidates, type) in candidatesByType" :key="type">
                <div v-if="candidates.length > 0" class="space-y-2">
                  <div class="flex items-center gap-2">
                    <UIcon
                      :name="candidateTypeInfo[type as keyof typeof candidateTypeInfo].icon"
                      :class="`text-${candidateTypeInfo[type as keyof typeof candidateTypeInfo].color}`"
                      class="w-4 h-4"
                    />
                    <span class="font-medium">
                      {{ candidateTypeInfo[type as keyof typeof candidateTypeInfo].label }}
                    </span>
                    <UBadge
                      :color="candidateTypeInfo[type as keyof typeof candidateTypeInfo].color"
                      variant="subtle"
                      size="xs"
                    >
                      {{ candidates.length }}
                    </UBadge>
                    <span class="text-xs text-muted-foreground">
                      - {{ candidateTypeInfo[type as keyof typeof candidateTypeInfo].description }}
                    </span>
                  </div>

                  <div class="space-y-1 ml-6">
                    <div
                      v-for="(candidate, idx) in candidates"
                      :key="idx"
                      class="text-xs font-mono text-muted-foreground bg-elevated p-2 rounded"
                    >
                      {{ candidate.address }}:{{ candidate.port }}
                      <span v-if="candidate.protocol" class="ml-2">
                        ({{ candidate.protocol }})
                      </span>
                      <span v-if="candidate.priority" class="ml-2 text-[10px]">
                        priority: {{ candidate.priority }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="iceCandidates.length === 0 && !isLoading" class="text-center py-8 text-muted-foreground">
                No candidates gathered yet. Run a test to see results.
              </div>

              <div v-if="isLoading" class="text-center py-8">
                <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-primary" />
                <p class="mt-2 text-sm text-muted-foreground">
                  Gathering ICE candidates...
                </p>
              </div>
            </div>
          </UCard>

          <!-- Server Info -->
          <UCard>
            <template #header>
              <h3 class="font-semibold">
                Server Configuration
              </h3>
            </template>

            <div class="space-y-2 font-mono text-sm">
              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">Server:</span>
                <span>turn.lastra.us</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">STUN Port:</span>
                <span>3478</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">TURN UDP/TCP:</span>
                <span>3478</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">TURN TLS:</span>
                <span>5349</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">Auth Method:</span>
                <span>HMAC-SHA1 (static secret)</span>
              </div>
            </div>
          </UCard>
        </div>
      </UCard>
    </UContainer>
  </div>
</template>
