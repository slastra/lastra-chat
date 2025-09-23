import { loadBots } from '../utils/bots'

export default defineEventHandler(async (event) => {
  try {
    const bots = await loadBots(event)

    return {
      data: bots
    }
  } catch (error) {
    console.error('[bots.get] Failed to load bots:', error)
    return {
      data: []
    }
  }
})
