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
    messageReceived: 'bong.ogg',
    messageSent: 'click.ogg',
    aiResponse: 'pluck.ogg',
    userJoined: 'open.ogg',
    userLeft: 'close.ogg',
    error: 'error.ogg',
    notification: 'confirmation.ogg'
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
    'back.ogg',
    'bong.ogg',
    'click.ogg',
    'close.ogg',
    'confirmation.ogg',
    'drop.ogg',
    'error.ogg',
    'glass.ogg',
    'glitch.ogg',
    'maximize.ogg',
    'minimize.ogg',
    'open.ogg',
    'pluck.ogg',
    'question.ogg',
    'scratch.ogg',
    'scroll.ogg',
    'select.ogg',
    'switch.ogg',
    'tick.ogg',
    'toggle.ogg'
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
