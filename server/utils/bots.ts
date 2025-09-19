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

// Use the auto-generated type from Nuxt Content with required shyness field
export interface BotConfig extends BotsCollectionItem {
  shyness: number // Make shyness required (not optional)
}

// Cache loaded bots to avoid repeated queries
let cachedBots: BotConfig[] | null = null
let cacheTimestamp = 0
const CACHE_DURATION = 60000 // 1 minute cache

// Load bots directly from content
export async function loadBots(event?: H3Event): Promise<BotConfig[]> {
  console.log('[BOTS UTILS] loadBots called, event present:', !!event)
  try {
    // Use cache if still valid
    if (cachedBots && Date.now() - cacheTimestamp < CACHE_DURATION) {
      console.log('[BOTS UTILS] Returning cached bots:', cachedBots.length)
      return cachedBots
    }

    // If we have an event context, use queryCollection directly
    if (event) {
      console.log('[BOTS UTILS] Using queryCollection with event')
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - queryCollection expects 1 arg but needs 2 in server context
      const bots = await queryCollection(event, 'bots').all()
      console.log('[BOTS UTILS] QueryCollection returned:', bots.length, 'bots')
      const botConfigs = bots.map((bot: BotsCollectionItem) => ({
        ...bot,
        shyness: bot.shyness ?? 0.5
      }))
      cachedBots = botConfigs
      cacheTimestamp = Date.now()
      console.log('[BOTS UTILS] Cached bots updated')
      return botConfigs
    }

    // Fallback: use cached data or return empty
    console.log('[BOTS UTILS] No event context, returning cached or empty')
    return cachedBots || []
  } catch (error) {
    console.error('[BOTS UTILS] Error loading bots:', error)
    return cachedBots || []
  }
}

export async function findBotByTrigger(message: string, event?: H3Event): Promise<BotConfig | null> {
  console.log('[BOTS UTILS] findBotByTrigger called for message:', message)
  const bots = await loadBots(event)
  console.log('[BOTS UTILS] Checking', bots.length, 'bots for triggers')

  for (const bot of bots) {
    const regex = new RegExp(`\\b(${bot.triggers.join('|')})\\b`, 'i')
    if (regex.test(message)) {
      console.log('[BOTS UTILS] Found matching bot:', bot.name)
      return bot
    }
  }

  console.log('[BOTS UTILS] No bot trigger matched')
  return null
}

export async function findAllBotsByTrigger(message: string, event?: H3Event): Promise<BotConfig[]> {
  console.log('[BOTS UTILS] findAllBotsByTrigger called for message:', message)
  const bots = await loadBots(event)
  console.log('[BOTS UTILS] Checking', bots.length, 'bots for triggers')
  const mentionedBots: BotConfig[] = []

  for (const bot of bots) {
    const regex = new RegExp(`\\b(${bot.triggers.join('|')})\\b`, 'i')
    if (regex.test(message)) {
      console.log('[BOTS UTILS] Found matching bot:', bot.name)
      mentionedBots.push(bot)
    }
  }

  console.log('[BOTS UTILS] Total bots matched:', mentionedBots.length)
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
