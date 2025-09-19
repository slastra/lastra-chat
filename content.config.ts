import { z } from 'zod'
import { defineCollection } from '@nuxt/content'

export const collections = {
  bots: defineCollection({
    source: 'bots/*.yaml',
    type: 'data',
    schema: z.object({
      name: z.string(),
      role: z.string(),
      triggers: z.array(z.string()),
      model: z.string().optional(),
      shyness: z.number().min(0).max(1).default(0.5),
      temperature: z.object({
        normal: z.number(),
        interjection: z.number()
      }),
      tools: z.array(z.string()).optional(),
      personality: z.object({
        interjection: z.string(),
        normal: z.string()
      })
    })
  })
}
