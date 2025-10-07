export interface DevicePreferences {
  camera?: string
  microphone?: string
  speaker?: string
}

const DEFAULT_PREFERENCES: DevicePreferences = {
  camera: undefined,
  microphone: undefined,
  speaker: undefined
}

const STORAGE_KEY = 'lastra-chat-device-preferences'

export const useDevicePreferences = () => {
  // Load preferences from localStorage or use defaults
  const loadPreferences = (): DevicePreferences => {
    if (import.meta.server) return DEFAULT_PREFERENCES

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        return {
          ...DEFAULT_PREFERENCES,
          ...parsed
        }
      }
    } catch (error) {
      console.warn('Failed to load device preferences:', error)
    }
    return DEFAULT_PREFERENCES
  }

  const preferences = useState<DevicePreferences>('devicePreferences', loadPreferences)

  // Save preferences to localStorage
  const savePreferences = () => {
    if (import.meta.server) return

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences.value))
    } catch (error) {
      console.warn('Failed to save device preferences:', error)
    }
  }

  // Reactive computed properties for easier access
  const camera = computed({
    get: () => preferences.value.camera,
    set: (value: string | undefined) => {
      preferences.value.camera = value
      savePreferences()
    }
  })

  const microphone = computed({
    get: () => preferences.value.microphone,
    set: (value: string | undefined) => {
      preferences.value.microphone = value
      savePreferences()
    }
  })

  const speaker = computed({
    get: () => preferences.value.speaker,
    set: (value: string | undefined) => {
      preferences.value.speaker = value
      savePreferences()
    }
  })

  // Set all preferences at once
  const setPreferences = (prefs: Partial<DevicePreferences>) => {
    preferences.value = {
      ...preferences.value,
      ...prefs
    }
    savePreferences()
  }

  // Reset to defaults
  const resetToDefaults = () => {
    preferences.value = { ...DEFAULT_PREFERENCES }
    savePreferences()
  }

  // Check if any preferences are saved
  const hasStoredPreferences = computed(() => {
    return !!(preferences.value.camera || preferences.value.microphone || preferences.value.speaker)
  })

  // Watch for changes and auto-save
  watch(preferences, savePreferences, { deep: true })

  return {
    // Reactive state
    camera,
    microphone,
    speaker,
    preferences: readonly(preferences),
    hasStoredPreferences,

    // Actions
    setPreferences,
    resetToDefaults,
    savePreferences
  }
}
