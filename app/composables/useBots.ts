import type { BotsCollectionItem } from '@nuxt/content'

// Use the auto-generated type with required shyness and mutable arrays
export interface BotConfig extends Omit<BotsCollectionItem, 'triggers'> {
  shyness: number // Make shyness required
  triggers: string[] // Make triggers mutable
}

// Client-side composable for bot detection
export const useBots = () => {
  const bots = useState<BotConfig[]>('bots', () => [])
  const botsEnabled = useState<Record<string, boolean>>('botsEnabled', () => ({}))
  const toast = useToast()

  // Load bots on client
  const loadBots = async () => {
    try {
      const { data } = await $fetch<{ data: BotConfig[] }>('/api/bots')
      bots.value = data || []
      // Initialize all bots as enabled by default
      data?.forEach((bot) => {
        if (botsEnabled.value[bot.name] === undefined) {
          botsEnabled.value[bot.name] = true
        }
      })
    } catch (error) {
      console.error('Failed to load bots:', error)
      // Return empty array if loading fails
      bots.value = []
    }
  }

  // Toggle bot enabled state (sends to server)
  const toggleBot = async (botName: string) => {
    const newState = !botsEnabled.value[botName]

    try {
      // Send toggle request to server
      await $fetch('/api/bot-toggle', {
        method: 'POST',
        body: {
          botName,
          enabled: newState
        }
      })

      // Optimistically update local state
      botsEnabled.value[botName] = newState
    } catch (error) {
      console.error('Failed to toggle bot:', error)
      toast.add({
        title: 'Failed to toggle bot',
        description: 'Please try again',
        color: 'error'
      })
    }
  }

  // Check if a bot is enabled
  const isBotEnabled = (botName: string) => {
    return botsEnabled.value[botName] ?? true
  }

  // Check if message mentions any enabled bot
  const detectBotMention = (message: string): BotConfig | null => {
    for (const bot of bots.value) {
      // Skip disabled bots
      if (!isBotEnabled(bot.name)) {
        continue
      }

      const regex = new RegExp(`\\b(${bot.triggers.join('|')})\\b`, 'i')
      if (regex.test(message)) {
        return bot
      }
    }

    return null
  }

  // Set all bot states (from SSE)
  const setBotStates = (states: Record<string, boolean>) => {
    botsEnabled.value = states
  }

  // Update single bot state (from SSE)
  const updateBotState = (botName: string, enabled: boolean) => {
    botsEnabled.value[botName] = enabled
  }

  return {
    bots: readonly(bots),
    botsEnabled: readonly(botsEnabled),
    loadBots,
    detectBotMention,
    toggleBot,
    isBotEnabled,
    setBotStates,
    updateBotState
  }
}
