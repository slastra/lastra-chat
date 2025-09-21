export type SoundEvent
  = | 'messageReceived'
    | 'messageSent'
    | 'aiResponse'
    | 'userJoined'
    | 'userLeft'
    | 'error'
    | 'notification'

export type SoundConfig = {
  [K in SoundEvent]: string
}

const DEFAULT_SOUND_CONFIG: SoundConfig = {
  messageReceived: 'bong_001.ogg',
  messageSent: 'click_001.ogg',
  aiResponse: 'pluck_001.ogg',
  userJoined: 'open_001.ogg',
  userLeft: 'close_001.ogg',
  error: 'error_001.ogg',
  notification: 'confirmation_001.ogg'
}

export const useSoundManager = () => {
  const audioCache = new Map<string, HTMLAudioElement>()
  const isInitialized = ref(false)
  const canPlayAudio = ref(false)

  // Initialize audio instances
  const initializeAudio = () => {
    if (isInitialized.value) return

    Object.values(DEFAULT_SOUND_CONFIG).forEach((soundFile) => {
      if (!audioCache.has(soundFile)) {
        const audio = new Audio(`/sounds/${soundFile}`)
        audio.preload = 'auto'
        audio.volume = 0.7
        audioCache.set(soundFile, audio)
      }
    })

    isInitialized.value = true
  }

  // Test if audio can be played (for autoplay policy detection)
  const testAudioPlayback = async () => {
    try {
      const testAudio = new Audio('/sounds/tick_001.ogg')
      testAudio.volume = 0.01
      await testAudio.play()
      testAudio.pause()
      canPlayAudio.value = true
      return true
    } catch {
      canPlayAudio.value = false
      return false
    }
  }

  // Enable audio after user interaction
  const enableAudio = async () => {
    if (!isInitialized.value) {
      initializeAudio()
    }

    // Test all cached audio files to "unlock" them
    const promises = Array.from(audioCache.values()).map(async (audio) => {
      try {
        audio.volume = 0.01
        await audio.play()
        audio.pause()
        audio.currentTime = 0
      } catch {
        console.warn('Failed to unlock audio')
      }
    })

    await Promise.all(promises)
    canPlayAudio.value = true
    return true
  }

  // Play a sound for a specific event
  const playSound = async (event: SoundEvent, volume: number = 0.7) => {
    const { soundConfig, enabled } = useSoundSettings()

    if (!enabled.value) {
      return
    }

    if (!isInitialized.value) {
      initializeAudio()
    }

    // Try to enable audio if it's not available yet
    if (!canPlayAudio.value) {
      const couldEnable = await testAudioPlayback()
      if (!couldEnable) {
        console.warn('Audio playback not available - user interaction required')
        return
      }
    }

    const soundFile = soundConfig.value[event as keyof SoundConfig]
    const audio = audioCache.get(soundFile)

    if (!audio) {
      console.warn(`Audio file not found: ${soundFile}`)
      return
    }

    try {
      audio.currentTime = 0
      audio.volume = Math.max(0, Math.min(1, volume))
      await audio.play()
    } catch (error) {
      console.warn(`Failed to play sound for ${event}:`, error)
      // Mark audio as unavailable if playback fails
      canPlayAudio.value = false
    }
  }

  // Set volume for all sounds
  const setGlobalVolume = (volume: number) => {
    const normalizedVolume = Math.max(0, Math.min(1, volume))
    audioCache.forEach((audio) => {
      audio.volume = normalizedVolume
    })
  }

  // Preload sounds when component mounts
  onMounted(() => {
    initializeAudio()
    testAudioPlayback()
  })

  return {
    playSound,
    enableAudio,
    setGlobalVolume,
    canPlayAudio: readonly(canPlayAudio),
    isInitialized: readonly(isInitialized),
    testAudioPlayback
  }
}
