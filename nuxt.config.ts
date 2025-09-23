// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxtjs/mdc',
    '@vueuse/nuxt',
    '@nuxt/content'
  ],

  ssr: false,

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

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
    // Public keys that are exposed to the client
    public: {
      livekitUrl: process.env.LIVEKIT_URL || 'ws://localhost:7880'
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
  }
})
