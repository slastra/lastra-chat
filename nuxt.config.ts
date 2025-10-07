// https://nuxt.com/docs/api/configuration/nuxt-config
import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/fonts',
    '@nuxtjs/mdc',
    '@vueuse/nuxt',
    '@nuxt/content',
    'nuxt-file-storage'
  ],

  ssr: false,

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css', 'gridstack/dist/gridstack.min.css'],

  mdc: {
    highlight: {
      // noApiRoute: true
      shikiEngine: 'javascript'
    }
  },

  // Runtime config for environment variables
  runtimeConfig: {
    // Private keys that are only available server-side
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
    livekitKey: process.env.LIVEKIT_KEY || '',
    livekitSecret: process.env.LIVEKIT_SECRET || '',
    myUsername: process.env.MY_USERNAME || '',
    ntfyUrl: process.env.NTFY_URL || '',
    ntfyTopic: process.env.NTFY_TOPIC || '',
    // Public keys that are exposed to the client
    public: {
      livekitUrl: process.env.LIVEKIT_URL || 'ws://localhost:7880',
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://lastra.us'
    }
  },

  experimental: {
    viewTransition: true
  },

  compatibilityDate: '2024-07-11',

  vite: {
    $server: {
      build: {
        rollupOptions: {
          output: {
            preserveModules: true
          }
        }
      }
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  fileStorage: {
    mount: process.env.FILE_STORAGE_MOUNT || './uploads'
  },

  fonts: {
    families: [
      { name: 'Inter', provider: 'google' },
      { name: 'Geist Mono', provider: 'google' }
    ],
    defaults: {
      weights: [400, 500, 600, 700],
      styles: ['normal'],
      subsets: ['latin']
    }
  }
})
