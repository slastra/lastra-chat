import { loadBots } from '../utils/bots'

export default defineEventHandler(async (event) => {
  console.log('[BOTS API] Loading bots via shared utility...')
  try {
    const bots = await loadBots(event)
    console.log('[BOTS API] Loaded bots count:', bots.length)

    return {
      data: bots
    }
  } catch (error) {
    console.error('[BOTS API] Error loading bots:', error)
    // Return empty array if no bots can be loaded
    return {
      data: []
    }
  }
})
