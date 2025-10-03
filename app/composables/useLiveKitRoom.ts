import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  ConnectionState,
  ConnectionQuality
} from 'livekit-client'

import type {
  TrackPublication,
  RemoteTrack,
  RemoteParticipant,
  LocalParticipant,
  AudioCaptureOptions,
  VideoCaptureOptions,
  RemoteVideoTrack,
  LocalVideoTrack,
  RemoteAudioTrack,
  LocalAudioTrack,
  Participant,
  RemoteTrackPublication,
  VideoQuality
} from 'livekit-client'

export interface UseLiveKitRoomOptions {
  roomName: string
  participantName: string
  participantMetadata?: Record<string, unknown>
  serverUrl?: string
  autoConnect?: boolean
}

export interface LiveKitParticipant {
  identity: string
  name?: string
  metadata?: Record<string, unknown>
  isCameraEnabled: boolean
  isMicrophoneEnabled: boolean
  isScreenShareEnabled: boolean
  audioLevel: number
  connectionQuality: 'excellent' | 'good' | 'poor' | 'unknown'
  tracks: {
    camera?: RemoteVideoTrack | LocalVideoTrack
    microphone?: RemoteAudioTrack | LocalAudioTrack
    screenShare?: RemoteVideoTrack | LocalVideoTrack
    screenShareAudio?: RemoteAudioTrack | LocalAudioTrack
  }
}

export interface UseLiveKitRoomReturn {
  // Room state
  room: Ref<Room | null>
  roomName: string
  isConnected: ComputedRef<boolean>
  isConnecting: ComputedRef<boolean>
  connectionState: Ref<ConnectionState>
  roomState: Ref<string>
  error: Ref<Error | null>

  // Participants
  localParticipant: ComputedRef<LiveKitParticipant | null>
  remoteParticipants: ComputedRef<LiveKitParticipant[]>
  participantCount: ComputedRef<number>

  // Local media state
  isCameraEnabled: Ref<boolean>
  isMicrophoneEnabled: Ref<boolean>
  isScreenShareEnabled: Ref<boolean>
  audioLevel: Ref<number>

  // Device management
  cameras: Ref<MediaDeviceInfo[]>
  microphones: Ref<MediaDeviceInfo[]>
  speakers: Ref<MediaDeviceInfo[]>
  selectedCamera: Ref<string | null>
  selectedMicrophone: Ref<string | null>
  selectedSpeaker: Ref<string | null>
  supportsSpeakerSelection: ComputedRef<boolean>

  // Methods
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  reconnect: () => Promise<void>

  // Media controls
  enableCamera: (enabled?: boolean) => Promise<void>
  enableMicrophone: (enabled?: boolean) => Promise<void>
  enableScreenShare: (enabled?: boolean) => Promise<void>

  // Device selection
  switchCamera: (deviceId: string) => Promise<void>
  switchMicrophone: (deviceId: string) => Promise<void>
  switchSpeaker: (deviceId: string) => Promise<void>
  refreshDevices: () => Promise<void>

  // Track management
  getParticipantTracks: (participantIdentity: string) => LiveKitParticipant['tracks']
  getVideoTrack: (participantIdentity: string, source?: 'camera' | 'screen_share') => RemoteVideoTrack | LocalVideoTrack | undefined
  getAudioTrack: (participantIdentity: string) => RemoteAudioTrack | LocalAudioTrack | undefined
  getScreenShareAudioTrack: (participantIdentity: string) => RemoteAudioTrack | LocalAudioTrack | undefined
  getVideoPublication: (participantIdentity: string, source?: 'camera' | 'screen_share') => RemoteTrackPublication | undefined
  setVideoQuality: (participantIdentity: string, quality: VideoQuality, source?: 'camera' | 'screen_share') => void

  // Events
  on: (event: string, handler: (...args: unknown[]) => void) => void
  off: (event: string, handler: (...args: unknown[]) => void) => void
}

export function useLiveKitRoom(options: UseLiveKitRoomOptions): UseLiveKitRoomReturn {
  const config = useRuntimeConfig()

  // Room instance
  const room = ref<Room | null>(null)
  const error = ref<Error | null>(null)

  // Connection state
  const connectionState = ref<ConnectionState>(ConnectionState.Disconnected)
  const roomState = ref<string>('disconnected')

  // Local media state
  const isCameraEnabled = ref(false)
  const isMicrophoneEnabled = ref(false)
  const isScreenShareEnabled = ref(false)
  const audioLevel = ref(0)

  // Device management
  const cameras = ref<MediaDeviceInfo[]>([])
  const microphones = ref<MediaDeviceInfo[]>([])
  const speakers = ref<MediaDeviceInfo[]>([])
  const selectedCamera = ref<string | null>(null)
  const selectedMicrophone = ref<string | null>(null)
  const selectedSpeaker = ref<string | null>(null)

  // Browser support detection
  const supportsSpeakerSelection = computed(() => {
    if (!import.meta.client) return false
    // Check if setSinkId is available on HTMLMediaElement
    const testElement = document.createElement('audio')
    return 'setSinkId' in testElement
  })

  // Participants state with tracks and connection quality
  const participantTracks = ref<Map<string, LiveKitParticipant['tracks']>>(new Map())
  const participantPublications = ref<Map<string, Map<Track.Source, RemoteTrackPublication>>>(new Map())
  const participantConnectionQuality = ref<Map<string, ConnectionQuality>>(new Map())
  const participantAudioLevels = ref<Map<string, number>>(new Map())
  // Keep analyser state per participant for real-time amplitude measurement
  const participantAnalysers: Map<string, {
    audioEl: HTMLMediaElement
    ctx: AudioContext
    src: MediaElementAudioSourceNode
    analyser: AnalyserNode
    raf?: number
  }> = new Map()

  function cleanupAnalyserState(identity: string) {
    const state = participantAnalysers.get(identity)
    if (state) {
      if (state.raf) cancelAnimationFrame(state.raf)
      try {
        state.analyser.disconnect()
      } catch (err) {
        void err
      }
      try {
        state.src.disconnect()
      } catch (err) {
        void err
      }
      try {
        state.audioEl.pause()
      } catch (err) {
        void err
      }
      try {
        if (state.audioEl.parentNode) state.audioEl.remove()
      } catch (err) {
        void err
      }
      try {
        state.ctx.close()
      } catch (err) {
        void err
      }
      participantAnalysers.delete(identity)
    }

    participantAudioLevels.value.delete(identity)
  }

  function clearParticipantState() {
    remoteParticipantIdentities.value.clear()
    participantTracks.value.clear()
    participantConnectionQuality.value.clear()
    participantAudioLevels.value.clear()

    Array.from(participantAnalysers.keys()).forEach(cleanupAnalyserState)
    audioLevel.value = 0
  }

  function getRoomOrThrow(): Room {
    const currentRoom = room.value
    if (!currentRoom) {
      throw new Error('Room not connected')
    }
    return currentRoom as Room
  }

  // Reactive participant list to ensure UI updates
  const remoteParticipantIdentities = ref<Set<string>>(new Set())

  // Event handlers map
  const eventHandlers = new Map<string, Set<(...args: unknown[]) => void>>()

  // Computed properties
  const isConnected = computed(() =>
    room.value?.state === 'connected'
  )

  const isConnecting = computed(() =>
    connectionState.value === ConnectionState.Connecting || connectionState.value === ConnectionState.Reconnecting
  )

  const localParticipant = computed((): LiveKitParticipant | null => {
    if (!room.value?.localParticipant) return null

    const participant = room.value.localParticipant
    const tracks = participantTracks.value.get(participant.identity) || {}

    return {
      identity: participant.identity,
      name: participant.name || options.participantName,
      metadata: participant.metadata ? JSON.parse(participant.metadata) : options.participantMetadata,
      isCameraEnabled: participant.isCameraEnabled,
      isMicrophoneEnabled: participant.isMicrophoneEnabled,
      isScreenShareEnabled: participant.isScreenShareEnabled,
      audioLevel: audioLevel.value,
      connectionQuality: 'excellent', // Local participant always has excellent quality
      tracks: tracks as {
        camera?: RemoteVideoTrack | LocalVideoTrack
        microphone?: RemoteAudioTrack | LocalAudioTrack
        screenShare?: RemoteVideoTrack | LocalVideoTrack
        screenShareAudio?: RemoteAudioTrack | LocalAudioTrack
      }
    }
  })

  const remoteParticipants = computed((): LiveKitParticipant[] => {
    if (!room.value) return []

    // Use our reactive participant list to trigger updates
    const participantIds = Array.from(remoteParticipantIdentities.value)
    return participantIds.map((identity) => {
      const participant = room.value!.remoteParticipants.get(identity)
      if (!participant) return null
      const tracks = participantTracks.value.get(participant.identity) || {}
      const quality = participantConnectionQuality.value.get(participant.identity)
      const audioLevel = participantAudioLevels.value.get(participant.identity) || 0

      // Map LiveKit ConnectionQuality to our interface
      let connectionQuality: 'excellent' | 'good' | 'poor' | 'unknown' = 'unknown'
      if (quality === ConnectionQuality.Excellent) connectionQuality = 'excellent'
      else if (quality === ConnectionQuality.Good) connectionQuality = 'good'
      else if (quality === ConnectionQuality.Poor) connectionQuality = 'poor'

      return {
        identity: participant.identity,
        name: participant.name || participant.identity,
        metadata: participant.metadata ? JSON.parse(participant.metadata) : {},
        isCameraEnabled: participant.isCameraEnabled,
        isMicrophoneEnabled: participant.isMicrophoneEnabled,
        isScreenShareEnabled: participant.isScreenShareEnabled,
        audioLevel,
        connectionQuality,
        tracks: tracks as {
          camera?: RemoteVideoTrack | LocalVideoTrack
          microphone?: RemoteAudioTrack | LocalAudioTrack
          screenShare?: RemoteVideoTrack | LocalVideoTrack
          screenShareAudio?: RemoteAudioTrack | LocalAudioTrack
        }
      }
    }).filter(Boolean) as LiveKitParticipant[]
  })

  const participantCount = computed(() =>
    (room.value?.numParticipants || 0)
  )

  // Initialize room
  function initializeRoom(): Room {
    const newRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
      disconnectOnPageLeave: false,
      publishDefaults: {
        // Enable higher quality video layers for better fullscreen viewing
        videoSimulcastLayers: [VideoPresets.h360, VideoPresets.h540, VideoPresets.h720, VideoPresets.h1080],
        // Use single high-quality screen share layer - no simulcast to force maximum quality
        screenShareEncoding: {
          maxBitrate: 12_000_000, // 12 Mbps for 60fps screen sharing
          maxFramerate: 60
        },
        videoCodec: 'av1', // AV1 provides best compression efficiency
        audioPreset: {
          maxBitrate: 20_000,
          priority: 'high'
        }
      },
      // Request higher quality video by default
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
        facingMode: 'user'
      }
    })

    attachRoomEventHandlers(newRoom)

    return newRoom
  }

  function attachRoomEventHandlers(roomInstance: Room) {
    roomInstance.on(RoomEvent.Connected, () => {
      connectionState.value = ConnectionState.Connected
      roomState.value = roomInstance.state
      error.value = null
      emitEvent('connected')
    })

    roomInstance.on(RoomEvent.Disconnected, (reason) => {
      connectionState.value = ConnectionState.Disconnected
      roomState.value = roomInstance.state
      clearParticipantState()
      emitEvent('disconnected', reason)
    })

    roomInstance.on(RoomEvent.Reconnecting, () => {
      connectionState.value = ConnectionState.Reconnecting
      emitEvent('reconnecting')
    })

    roomInstance.on(RoomEvent.Reconnected, () => {
      connectionState.value = ConnectionState.Connected
      roomState.value = roomInstance.state
      error.value = null
      emitEvent('reconnected')
    })

    roomInstance.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      remoteParticipantIdentities.value.add(participant.identity)
      emitEvent('participantConnected', participant)
    })

    roomInstance.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      remoteParticipantIdentities.value.delete(participant.identity)
      participantPublications.value.delete(participant.identity)
      participantTracks.value.delete(participant.identity)
      participantConnectionQuality.value.delete(participant.identity)
      cleanupAnalyserState(participant.identity)
      emitEvent('participantDisconnected', participant)
    })

    roomInstance.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: TrackPublication, participant: RemoteParticipant) => {
      updateParticipantTracks(participant.identity, track, publication.source, 'add')

      if (publication.kind === Track.Kind.Video) {
        if (!participantPublications.value.has(participant.identity)) {
          participantPublications.value.set(participant.identity, new Map())
        }
        const pubMap = participantPublications.value.get(participant.identity)!
        pubMap.set(publication.source, publication as RemoteTrackPublication)
      }

      setupAudioLevelMonitoring(track, participant.identity)
      emitEvent('trackSubscribed', track, publication, participant)
    })

    roomInstance.on(RoomEvent.TrackMuted, (publication: TrackPublication, participant: Participant) => {
      if (publication.kind === Track.Kind.Video && publication.track && publication.source === Track.Source.Camera) {
        updateParticipantTracks(participant.identity, publication.track as RemoteTrack | LocalVideoTrack, publication.source, 'remove')
      } else if (publication.kind === Track.Kind.Audio && publication.track) {
        const tracks = participantTracks.value.get(participant.identity) || {}
        participantTracks.value.set(participant.identity, { ...tracks })
      }
      emitEvent('trackMuted', publication, participant)
    })

    roomInstance.on(RoomEvent.TrackUnmuted, (publication: TrackPublication, participant: Participant) => {
      if (publication.kind === Track.Kind.Video && publication.track && publication.source === Track.Source.Camera) {
        updateParticipantTracks(participant.identity, publication.track as RemoteTrack | LocalVideoTrack, publication.source, 'add')
        if (participant === roomInstance.localParticipant) {
          setupAudioLevelMonitoring(publication.track as LocalVideoTrack, participant.identity)
        }
      } else if (publication.kind === Track.Kind.Audio && publication.track) {
        const tracks = participantTracks.value.get(participant.identity) || {}
        participantTracks.value.set(participant.identity, { ...tracks })
      }
      emitEvent('trackUnmuted', publication, participant)
    })

    roomInstance.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: TrackPublication, participant: RemoteParticipant) => {
      updateParticipantTracks(participant.identity, track, publication.source, 'remove')
      if (track.kind === Track.Kind.Audio) {
        cleanupAnalyserState(participant.identity)
      }
      emitEvent('trackUnsubscribed', track, publication, participant)
    })

    roomInstance.on(RoomEvent.LocalTrackPublished, (publication: TrackPublication, participant: LocalParticipant) => {
      if (publication.track) {
        updateParticipantTracks(participant.identity, publication.track as LocalAudioTrack | LocalVideoTrack, publication.source, 'add')
        setupAudioLevelMonitoring(publication.track as LocalAudioTrack | LocalVideoTrack, participant.identity)
      }
      updateLocalMediaState()
      emitEvent('localTrackPublished', publication, participant)
    })

    roomInstance.on(RoomEvent.LocalTrackUnpublished, (publication: TrackPublication, participant: LocalParticipant) => {
      if (publication.track) {
        updateParticipantTracks(participant.identity, publication.track as LocalAudioTrack | LocalVideoTrack, publication.source, 'remove')
        if (publication.track.kind === Track.Kind.Audio) {
          cleanupAnalyserState(participant.identity)
        }
      }
      updateLocalMediaState()
      emitEvent('localTrackUnpublished', publication, participant)
    })

    roomInstance.on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, participant: Participant) => {
      participantConnectionQuality.value.set(participant.identity, quality)
      emitEvent('connectionQualityChanged', quality, participant)
    })

    roomInstance.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      participantAudioLevels.value.forEach((_, identity) => {
        participantAudioLevels.value.set(identity, 0)
      })

      speakers.forEach((speaker) => {
        const level = Math.round((speaker.audioLevel ?? 0) * 100)
        participantAudioLevels.value.set(speaker.identity, level)

        if (speaker.identity === roomInstance.localParticipant.identity) {
          audioLevel.value = level
        }
      })

      if (speakers.length === 0 && roomInstance.localParticipant) {
        audioLevel.value = 0
      }
    })
  }

  // Update participant tracks
  function updateParticipantTracks(
    participantIdentity: string,
    track: RemoteTrack | LocalAudioTrack | LocalVideoTrack,
    source: string,
    action: 'add' | 'remove'
  ) {
    const currentTracks = participantTracks.value.get(participantIdentity) || {}
    // Always create a new object for Vue reactivity
    const newTracks = { ...currentTracks }

    if (action === 'add') {
      if (track.kind === Track.Kind.Video) {
        if (source === 'camera') {
          newTracks.camera = track as RemoteVideoTrack | LocalVideoTrack
        } else if (source === 'screen_share') {
          newTracks.screenShare = track as RemoteVideoTrack | LocalVideoTrack
        }
      } else if (track.kind === Track.Kind.Audio) {
        if (source === 'microphone') {
          newTracks.microphone = track as RemoteAudioTrack | LocalAudioTrack
        } else if (source === 'screen_share_audio') {
          newTracks.screenShareAudio = track as RemoteAudioTrack | LocalAudioTrack
        }
      }
    } else {
      // Remove track
      if (track.kind === Track.Kind.Video) {
        if (source === 'camera') {
          delete newTracks.camera
        } else if (source === 'screen_share') {
          delete newTracks.screenShare
        }
      } else if (track.kind === Track.Kind.Audio) {
        if (source === 'microphone') {
          delete newTracks.microphone
        } else if (source === 'screen_share_audio') {
          delete newTracks.screenShareAudio
        }
      }
    }

    participantTracks.value.set(participantIdentity, newTracks)
  }

  // Setup audio level monitoring
  function setupAudioLevelMonitoring(track: RemoteTrack | LocalAudioTrack | LocalVideoTrack, participantIdentity: string) {
    if (track.kind === Track.Kind.Audio) {
      const audioTrack = track as RemoteAudioTrack | LocalAudioTrack

      // Ensure prior analysers are cleaned before creating a new one
      cleanupAnalyserState(participantIdentity)

      // Try to attach the track to a hidden audio element and measure amplitude via WebAudio
      try {
        // Prefer using the raw MediaStreamTrack (if available) as source for analyser
        const maybeMediaStreamTrack = (audioTrack as unknown as { mediaStreamTrack?: MediaStreamTrack }).mediaStreamTrack
        // Look up AudioContext constructor (handle vendor prefixes)
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const AudioCtxCtor = (window as any).AudioContext || (window as any).webkitAudioContext
        /* eslint-enable @typescript-eslint/no-explicit-any */
        if (!AudioCtxCtor) {
          console.debug('[LiveKit][analyser] no AudioContext available in this environment')
          // bail out - rely on ActiveSpeakersChanged fallback
          participantAudioLevels.value.set(participantIdentity, 0)
          return
        }
        const ctx = new AudioCtxCtor()
        let src: MediaElementAudioSourceNode | MediaStreamAudioSourceNode
        let analyser: AnalyserNode
        let audioEl: HTMLMediaElement | undefined

        if (maybeMediaStreamTrack) {
          // Use MediaStreamTrack -> MediaStream -> MediaStreamAudioSourceNode
          const ms = new MediaStream([maybeMediaStreamTrack])
          src = ctx.createMediaStreamSource(ms)
          analyser = ctx.createAnalyser()
          analyser.fftSize = 512
          src.connect(analyser)
          console.debug('[LiveKit][analyser] using MediaStreamTrack for', participantIdentity)
        } else {
          // Fallback: attach to an audio element
          const attachFn = (audioTrack as unknown as { attach?: () => HTMLMediaElement }).attach
          audioEl = attachFn ? attachFn.call(audioTrack) : document.createElement('audio')
          audioEl.muted = true
          audioEl.volume = 0
          audioEl.style.position = 'absolute'
          audioEl.style.left = '-9999px'
          audioEl.style.width = '1px'
          audioEl.style.height = '1px'
          audioEl.autoplay = true
          if (!document.body.contains(audioEl)) {
            document.body.appendChild(audioEl)
          }
          try {
            const p = audioEl.play()
            if (p && typeof (p as Promise<void>).catch === 'function') {
              (p as Promise<void>).catch((e) => {
                console.debug('[LiveKit][analyser] audioEl.play() rejected', e)
              })
            }
          } catch (err) {
            console.debug('[LiveKit][analyser] audioEl.play() failed', err)
          }

          src = ctx.createMediaElementSource(audioEl)
          analyser = ctx.createAnalyser()
          analyser.fftSize = 512
          src.connect(analyser)
          console.debug('[LiveKit][analyser] using attached element for', participantIdentity)
        }

        const buffer = new Uint8Array(analyser.fftSize)

        const tick = () => {
          analyser.getByteTimeDomainData(buffer)
          // compute RMS from time domain (0..255 center at 128)
          let sum = 0
          if (buffer && buffer.length) {
            for (let i = 0; i < buffer.length; i++) {
              const val = buffer[i] ?? 128
              const v = (val - 128) / 128
              sum += v * v
            }
          }
          const rms = Math.sqrt(sum / buffer.length) // 0..1
          const level = Math.round(Math.min(1, rms) * 100)
          participantAudioLevels.value.set(participantIdentity, level)

          // Update local audio level if it's the local participant
          if (participantIdentity === room.value?.localParticipant.identity) {
            audioLevel.value = level
          }
          const raf = requestAnimationFrame(tick)
          const state = participantAnalysers.get(participantIdentity)
          if (state) state.raf = raf
        }

        participantAnalysers.set(participantIdentity, { audioEl: audioEl as HTMLMediaElement, ctx, src: src as MediaElementAudioSourceNode, analyser, raf: undefined })
        // start measuring
        console.debug('[LiveKit][analyser] started for', participantIdentity)
        tick()

        // Clean up when track ends
        audioTrack.on('ended', () => {
          cleanupAnalyserState(participantIdentity)
        })
      } catch (err) {
        // Fallback: leave levels to ActiveSpeakersChanged if analyser fails
        // ensure there's an entry and cleanup on end
        console.debug('[LiveKit][analyser] setup failed', err)
        participantAudioLevels.value.set(participantIdentity, 0)
        audioTrack.on('ended', () => {
          cleanupAnalyserState(participantIdentity)
        })
      }
    }
  }

  // Update local media state
  function updateLocalMediaState() {
    if (!room.value?.localParticipant) return

    const participant = room.value.localParticipant
    isCameraEnabled.value = participant.isCameraEnabled
    isMicrophoneEnabled.value = participant.isMicrophoneEnabled
    isScreenShareEnabled.value = participant.isScreenShareEnabled
  }

  // Event management
  function emitEvent(event: string, ...args: unknown[]) {
    const handlers = eventHandlers.get(event)
    if (handlers) {
      handlers.forEach(handler => handler(...args))
    }
  }

  function on(event: string, handler: (...args: unknown[]) => void) {
    if (!eventHandlers.has(event)) {
      eventHandlers.set(event, new Set())
    }
    eventHandlers.get(event)!.add(handler)
  }

  function off(event: string, handler: (...args: unknown[]) => void) {
    const handlers = eventHandlers.get(event)
    if (handlers) {
      handlers.delete(handler)
    }
  }

  // Connection methods
  async function connect(): Promise<void> {
    try {
      error.value = null
      connectionState.value = ConnectionState.Connecting

      // Generate token
      const tokenResponse = await $fetch('/api/livekit-token', {
        method: 'POST',
        body: {
          roomName: options.roomName,
          participantName: options.participantName,
          participantMetadata: options.participantMetadata
        }
      })

      // Initialize room if not already done
      if (!room.value) {
        room.value = initializeRoom()
      }

      // Connect to room
      const serverUrl = options.serverUrl || config.public.livekitUrl
      await room.value.connect(serverUrl, tokenResponse.token)

      // Initialize participant list with existing participants
      remoteParticipantIdentities.value.clear()
      room.value.remoteParticipants.forEach((participant) => {
        remoteParticipantIdentities.value.add(participant.identity)
      })

      // Refresh devices after connection
      await refreshDevices()
    } catch (err) {
      console.error('[LiveKit] Connection failed:', err)
      error.value = err as Error
      connectionState.value = ConnectionState.Disconnected
      roomState.value = 'disconnected'
      room.value = null
      clearParticipantState()
      throw err
    }
  }

  async function disconnect(): Promise<void> {
    if (room.value) {
      await room.value.disconnect()
      room.value = null
    }
    clearParticipantState()
    roomState.value = 'disconnected'
    connectionState.value = ConnectionState.Disconnected
  }

  async function reconnect(): Promise<void> {
    await disconnect()
    await connect()
  }

  // Media control methods
  async function enableCamera(enabled = true, enableMicWithCamera = true): Promise<void> {
    const currentRoom = getRoomOrThrow()

    if (enabled) {
      const options: VideoCaptureOptions = {
        resolution: VideoPresets.h720.resolution,
        deviceId: selectedCamera.value || undefined
      }
      await currentRoom.localParticipant.setCameraEnabled(true, options)

      // Automatically enable microphone with camera for unified video call experience
      if (enableMicWithCamera && !isMicrophoneEnabled.value) {
        await enableMicrophone(true)
      }
    } else {
      await currentRoom.localParticipant.setCameraEnabled(false)
    }

    updateLocalMediaState()
  }

  async function enableMicrophone(enabled = true): Promise<void> {
    const currentRoom = getRoomOrThrow()

    if (enabled) {
      const options: AudioCaptureOptions = {
        deviceId: selectedMicrophone.value || undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
      await currentRoom.localParticipant.setMicrophoneEnabled(true, options)
    } else {
      await currentRoom.localParticipant.setMicrophoneEnabled(false)
    }

    updateLocalMediaState()
  }

  async function enableScreenShare(enabled = true): Promise<void> {
    const currentRoom = getRoomOrThrow()

    try {
      const localParticipant = currentRoom.localParticipant

      if (enabled) {
        // Try multiple approaches to bypass 30fps browser limits
        try {
          // Approach 1: Use createScreenTracks with more explicit constraints
          const tracks = await localParticipant.createScreenTracks({
            audio: true,
            resolution: {
              width: 1920,
              height: 1080,
              frameRate: 60 // Explicit 60fps request
            },
            video: {
              displaySurface: 'monitor' // Request full monitor capture for potentially higher fps
            },
            contentHint: 'motion',
            // Try to bypass browser throttling
            selfBrowserSurface: 'exclude'
          })

          // Publish tracks with explicit high-performance encoding
          await Promise.all(tracks.map((track) => {
            if (track.kind === 'video') {
              return localParticipant.publishTrack(track, {
                videoEncoding: {
                  maxBitrate: 12_000_000,
                  maxFramerate: 60,
                  priority: 'high'
                }
              })
            } else {
              // Audio track - use default settings
              return localParticipant.publishTrack(track)
            }
          }))
        } catch (error) {
          console.warn('[LiveKit] Advanced screen capture failed, falling back to standard:', error)
          // Fallback to original method
          await localParticipant.setScreenShareEnabled(true, {
            audio: true,
            resolution: {
              width: 1920,
              height: 1080,
              frameRate: 60
            },
            video: true,
            contentHint: 'motion'
          })
        }
      } else {
        await localParticipant.setScreenShareEnabled(false)
      }

      updateLocalMediaState()
    } catch (error) {
      console.error('[LiveKit] Failed to toggle screen share:', error)
      throw error
    }
  }

  // Device management
  async function refreshDevices(): Promise<void> {
    try {
      const devices = await Room.getLocalDevices()

      cameras.value = devices.filter(d => d.kind === 'videoinput')
      microphones.value = devices.filter(d => d.kind === 'audioinput')
      speakers.value = devices.filter(d => d.kind === 'audiooutput')

      // Set default devices if none selected
      if (!selectedCamera.value && cameras.value.length > 0) {
        selectedCamera.value = cameras.value[0]?.deviceId || null
      }
      if (!selectedMicrophone.value && microphones.value.length > 0) {
        selectedMicrophone.value = microphones.value[0]?.deviceId || null
      }
      if (!selectedSpeaker.value && speakers.value.length > 0) {
        selectedSpeaker.value = speakers.value[0]?.deviceId || null
      }
    } catch (err) {
      console.error('[LiveKit] Failed to refresh devices:', err)
    }
  }

  async function switchCamera(deviceId: string): Promise<void> {
    selectedCamera.value = deviceId
    if (room.value) {
      try {
        await room.value.switchActiveDevice('videoinput', deviceId)
      } catch (error) {
        console.error('[LiveKit] Failed to switch camera:', error)
        throw error
      }
    }
  }

  async function switchMicrophone(deviceId: string): Promise<void> {
    selectedMicrophone.value = deviceId
    // Only switch active device if microphone is currently enabled
    // If disabled, the new device will be used next time it's enabled
    if (room.value && isMicrophoneEnabled.value) {
      try {
        await room.value.switchActiveDevice('audioinput', deviceId)
      } catch (error) {
        console.error('[LiveKit] Failed to switch microphone:', error)
        throw error
      }
    }
  }

  async function switchSpeaker(deviceId: string): Promise<void> {
    selectedSpeaker.value = deviceId
    if (room.value) {
      try {
        await room.value.switchActiveDevice('audiooutput', deviceId)
      } catch (error) {
        console.error('[LiveKit] Failed to switch speaker:', error)
        throw error
      }
    }
  }

  // Track getters
  function getParticipantTracks(participantIdentity: string): LiveKitParticipant['tracks'] {
    const tracks = participantTracks.value.get(participantIdentity) || {}
    return tracks as LiveKitParticipant['tracks']
  }

  function getVideoTrack(participantIdentity: string, source: 'camera' | 'screen_share' = 'camera'): RemoteVideoTrack | LocalVideoTrack | undefined {
    const tracks = getParticipantTracks(participantIdentity)
    return source === 'camera' ? tracks.camera : tracks.screenShare
  }

  function getAudioTrack(participantIdentity: string): RemoteAudioTrack | LocalAudioTrack | undefined {
    const tracks = getParticipantTracks(participantIdentity)
    return tracks.microphone
  }

  function getScreenShareAudioTrack(participantIdentity: string): RemoteAudioTrack | LocalAudioTrack | undefined {
    const tracks = getParticipantTracks(participantIdentity)
    return tracks.screenShareAudio
  }

  function getVideoPublication(participantIdentity: string, source: 'camera' | 'screen_share' = 'camera'): RemoteTrackPublication | undefined {
    const pubMap = participantPublications.value.get(participantIdentity)
    if (!pubMap) return undefined
    const sourceKey = source === 'camera' ? Track.Source.Camera : Track.Source.ScreenShare
    return pubMap.get(sourceKey) as RemoteTrackPublication | undefined
  }

  function setVideoQuality(participantIdentity: string, quality: VideoQuality, source: 'camera' | 'screen_share' = 'camera'): void {
    const publication = getVideoPublication(participantIdentity, source)
    if (publication && 'setVideoQuality' in publication) {
      try {
        publication.setVideoQuality(quality)
      } catch (error) {
        console.error('[LiveKitRoom] Failed to set video quality:', error)
      }
    }
  }

  // Auto-connect if requested
  if (options.autoConnect) {
    onMounted(() => {
      connect().catch(console.error)
    })
  }

  // Cleanup on unmount
  onUnmounted(() => {
    disconnect().catch(console.error)
  })

  return {
    // Room state
    room: room as Ref<Room | null>,
    roomName: options.roomName,
    isConnected,
    isConnecting,
    connectionState: readonly(connectionState),
    roomState: readonly(roomState),
    error: readonly(error),

    // Participants
    localParticipant,
    remoteParticipants,
    participantCount,

    // Local media state
    isCameraEnabled: readonly(isCameraEnabled),
    isMicrophoneEnabled: readonly(isMicrophoneEnabled),
    isScreenShareEnabled: readonly(isScreenShareEnabled),
    audioLevel: readonly(audioLevel),

    // Device management
    cameras,
    microphones,
    speakers,
    selectedCamera,
    selectedMicrophone,
    selectedSpeaker,
    supportsSpeakerSelection,

    // Methods
    connect,
    disconnect,
    reconnect,

    // Media controls
    enableCamera,
    enableMicrophone,
    enableScreenShare,

    // Device selection
    switchCamera,
    switchMicrophone,
    switchSpeaker,
    refreshDevices,

    // Track management
    getParticipantTracks,
    getVideoTrack,
    getAudioTrack,
    getScreenShareAudioTrack,
    getVideoPublication,
    setVideoQuality,

    // Events
    on,
    off
  }
}
