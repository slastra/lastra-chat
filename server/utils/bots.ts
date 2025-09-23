// Server-side bot utilities
import type { BotsCollectionItem } from '@nuxt/content'
import type { H3Event } from 'h3'

// Calculate bot's interjection probability using smooth sigmoid with shyness factor
export const calculateInterjectionProbability = (userCount: number, shyness: number = 0.5): number => {
  // Shyness of 1 means never interject (return 0)
  if (shyness >= 1) return 0

  // Shyness affects the overall probability
  // shyness = 0: very chatty (higher probability)
  // shyness = 0.5: normal behavior
  // shyness = 0.99: extremely shy (very low probability)
  // shyness = 1: never interjects (handled above)

  // Base sigmoid: probability = (1 - shyness) / (1 + factor * (userCount - 1))
  // The (1 - shyness) multiplier ensures probability approaches 0 as shyness approaches 1
  const factor = 0.5
  const baseProbability = 1 / (1 + factor * (userCount - 1))
  return baseProbability * (1 - shyness)
}

// Use the auto-generated type from Nuxt Content with required shyness field and mutable arrays
export interface BotConfig extends Omit<BotsCollectionItem, 'triggers'> {
  shyness: number // Make shyness required (not optional)
  triggers: string[] // Make triggers mutable
}

// Cache loaded bots to avoid repeated queries
let cachedBots: BotConfig[] | null = null
let cacheTimestamp = 0
const CACHE_DURATION = 60000 // 1 minute cache

// Load bots directly from content
export async function loadBots(event?: H3Event): Promise<BotConfig[]> {
  try {
    // Use cache if still valid
    if (cachedBots && Date.now() - cacheTimestamp < CACHE_DURATION) {
      return cachedBots
    }

    // If we have an event context, use queryCollection directly
    if (event) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - queryCollection expects 1 arg but needs 2 in server context
      const bots = await queryCollection(event, 'bots').all()
      const botConfigs = bots.map((bot: BotsCollectionItem) => ({
        ...bot,
        shyness: bot.shyness ?? 0.5,
        triggers: [...bot.triggers] // Make triggers mutable
      }))
      cachedBots = botConfigs
      cacheTimestamp = Date.now()
      return botConfigs
    }

    // Fallback: use cached data or return empty
    return cachedBots || []
  } catch (error) {
    console.error('[bots] Failed to load bots:', error)
    return cachedBots || []
  }
}

export async function findBotByTrigger(message: string, event?: H3Event): Promise<BotConfig | null> {
  const bots = await loadBots(event)

  for (const bot of bots) {
    const regex = new RegExp(`\\b(${bot.triggers.join('|')})\\b`, 'i')
    if (regex.test(message)) {
      return bot
    }
  }

  return null
}

export async function findAllBotsByTrigger(message: string, event?: H3Event): Promise<BotConfig[]> {
  const bots = await loadBots(event)
  const mentionedBots: BotConfig[] = []

  for (const bot of bots) {
    const regex = new RegExp(`\\b(${bot.triggers.join('|')})\\b`, 'i')
    if (regex.test(message)) {
      mentionedBots.push(bot)
    }
  }

  return mentionedBots
}

export async function checkRandomInterjections(userCount: number, disabledBots: string[] = [], event?: H3Event): Promise<BotConfig[]> {
  const bots = await loadBots(event)
  const interjecting: BotConfig[] = []

  // Check each bot for interjection probability
  for (const bot of bots) {
    // Skip disabled bots
    if (disabledBots.includes(bot.name)) continue

    // Skip bots with shyness = 1 (never interject)
    if (bot.shyness >= 1) continue

    const probability = calculateInterjectionProbability(userCount, bot.shyness)

    if (Math.random() < probability) {
      interjecting.push(bot)
    }
  }

  return interjecting
}

// Keep the old function for backwards compatibility but have it use the new one
export async function checkRandomInterjection(userCount: number, disabledBots: string[] = [], event?: H3Event): Promise<BotConfig | null> {
  const bots = await checkRandomInterjections(userCount, disabledBots, event)
  return bots.length > 0 ? bots[0]! : null
}
