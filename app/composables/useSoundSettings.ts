import type { SoundConfig, SoundEvent } from './useSoundManager'

export interface SoundSettings {
  enabled: boolean
  volume: number
  soundConfig: SoundConfig
}

const DEFAULT_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 0.7,
  soundConfig: {
    messageReceived: 'bong_001.ogg',
    messageSent: 'click_001.ogg',
    aiResponse: 'pluck_001.ogg',
    userJoined: 'open_001.ogg',
    userLeft: 'close_001.ogg',
    error: 'error_001.ogg',
    notification: 'confirmation_001.ogg'
  }
}

const STORAGE_KEY = 'lastra-chat-sound-settings'

export const useSoundSettings = () => {
  // Load settings from localStorage or use defaults
  const loadSettings = (): SoundSettings => {
    if (import.meta.server) return DEFAULT_SETTINGS

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        // Merge with defaults to ensure all properties exist
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          soundConfig: {
            ...DEFAULT_SETTINGS.soundConfig,
            ...parsed.soundConfig
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load sound settings:', error)
    }
    return DEFAULT_SETTINGS
  }

  const settings = useState<SoundSettings>('soundSettings', loadSettings)

  // Save settings to localStorage
  const saveSettings = () => {
    if (import.meta.server) return

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
    } catch (error) {
      console.warn('Failed to save sound settings:', error)
    }
  }

  // Reactive computed properties for easier access
  const enabled = computed({
    get: () => settings.value.enabled,
    set: (value: boolean) => {
      settings.value.enabled = value
      saveSettings()
    }
  })

  const volume = computed({
    get: () => settings.value.volume,
    set: (value: number) => {
      settings.value.volume = Math.max(0, Math.min(1, value))
      saveSettings()
    }
  })

  const soundConfig = computed({
    get: () => settings.value.soundConfig,
    set: (value: SoundConfig) => {
      settings.value.soundConfig = value
      saveSettings()
    }
  })

  // Update a specific sound mapping
  const setSoundForEvent = (event: SoundEvent, soundFile: string) => {
    settings.value.soundConfig = {
      ...settings.value.soundConfig,
      [event]: soundFile
    }
    saveSettings()
  }

  // Reset to defaults
  const resetToDefaults = () => {
    settings.value = { ...DEFAULT_SETTINGS }
    saveSettings()
  }

  // Toggle enabled state
  const toggleEnabled = () => {
    enabled.value = !enabled.value
  }

  // Available sound files (based on what's in the public/sounds directory)
  const availableSounds = [
    'back_001.ogg',
    'bong_001.ogg',
    'click_001.ogg',
    'close_001.ogg',
    'confirmation_001.ogg',
    'drop_001.ogg',
    'error_001.ogg',
    'glass_001.ogg',
    'glitch_001.ogg',
    'maximize_001.ogg',
    'minimize_001.ogg',
    'open_001.ogg',
    'pluck_001.ogg',
    'question_001.ogg',
    'scratch_001.ogg',
    'scroll_001.ogg',
    'select_001.ogg',
    'switch_001.ogg',
    'tick_001.ogg',
    'toggle_001.ogg'
  ]

  // Watch for changes and auto-save
  watch(settings, saveSettings, { deep: true })

  return {
    // Reactive state
    enabled,
    volume,
    soundConfig,
    settings: readonly(settings),

    // Actions
    setSoundForEvent,
    resetToDefaults,
    toggleEnabled,
    saveSettings,

    // Constants
    availableSounds,
    defaultSettings: DEFAULT_SETTINGS
  }
}
