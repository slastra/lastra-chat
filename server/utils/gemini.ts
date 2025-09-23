import { GoogleGenAI } from '@google/genai'
import type { BotConfig } from './bots'
import type { ChatMessage } from '../types/chat'

// Initialize Gemini AI client
let genAI: GoogleGenAI | null = null

function getGeminiClient(): GoogleGenAI {
  if (!genAI) {
    // Use Nuxt's runtime config to access the environment variable
    const config = useRuntimeConfig()
    const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY || process.env.NUXT_GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured in environment variables')
    }
    genAI = new GoogleGenAI({ apiKey })
  }
  return genAI
}

export interface BotResponseOptions {
  bot: BotConfig
  message: ChatMessage
  recentMessages: ChatMessage[]
  userCount: number
}

export async function generateBotResponse(options: BotResponseOptions): Promise<string> {
  const { bot, message, recentMessages } = options

  try {
    const genAI = getGeminiClient()
    const config = useRuntimeConfig()

    // Get the appropriate model (default to runtime config or fallback)
    const modelName = bot.model || config.geminiModel || 'gemini-2.0-flash-exp'

    // Determine if this is a direct mention or an interjection
    const isMention = bot.triggers.some(trigger =>
      message.content.toLowerCase().includes(trigger.toLowerCase())
      || message.content.includes(`@${bot.name}`)
    )

    // Choose the appropriate personality prompt
    const personalityPrompt = isMention
      ? bot.personality.normal
      : bot.personality.interjection

    // Build the conversation context
    const context = recentMessages
      .slice(-10) // Last 10 messages for context
      .map(msg => `${msg.userName}: ${msg.content}`)
      .join('\n')

    // Build the system prompt
    const systemPrompt = `${personalityPrompt}

Recent conversation:
${context}

Current message from ${message.userName}: ${message.content}

Remember to keep your response brief (1-3 sentences) and in character as ${bot.name}.`

    // Get the appropriate temperature
    const temperature = isMention
      ? bot.temperature?.normal || 1.0
      : bot.temperature?.interjection || 1.2

    const requestParams = {
      model: modelName,
      contents: [{
        role: 'user',
        parts: [{
          text: systemPrompt
        }]
      }],
      config: {
        temperature,
        maxOutputTokens: 150, // Keep responses short
        topP: 0.95,
        topK: 40
      }
    }

    // Generate the response
    const result = await genAI.models.generateContent(requestParams)

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      throw new Error('Empty response from Gemini')
    }

    return text.trim()
  } catch (error) {
    console.error(`[Gemini] Error generating response for bot ${bot.name}:`, error)
    // Return a fallback response
    const fallbacks = [
      'I\'m having trouble thinking right now...',
      'My circuits are a bit fried at the moment.',
      'Can\'t process that right now.',
      'Error 404: Response not found.'
    ]

    return fallbacks[Math.floor(Math.random() * fallbacks.length)]!
  }
}

// Check if bot should randomly interject
export function shouldBotInterject(bot: BotConfig, userCount: number): boolean {
  // Never interject if shyness is 1
  if (bot.shyness >= 1) return false

  // Calculate probability based on shyness and user count
  const factor = 0.5
  const baseProbability = 1 / (1 + factor * (userCount - 1))
  const probability = baseProbability * (1 - bot.shyness)

  return Math.random() < probability
}
