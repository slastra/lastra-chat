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

import type { ParticipantTracks } from './useParticipantTracking'

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
  tracks: ParticipantTracks
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
  getParticipantTracks: (participantIdentity: string) => ParticipantTracks
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

  // Composables for separated concerns
  const audioMonitoring = useAudioLevelMonitoring()
  const deviceManagement = useDeviceManagement()
  const participantTracking = useParticipantTracking()
  const eventEmitter = useEventEmitter()

  // Connection quality state
  const participantConnectionQuality = ref<Map<string, ConnectionQuality>>(new Map())

  function clearParticipantState() {
    participantTracking.clearAll()
    participantConnectionQuality.value.clear()
    audioMonitoring.clearAll()
    audioLevel.value = 0
  }

  function getRoomOrThrow(): Room {
    const currentRoom = room.value
    if (!currentRoom) {
      throw new Error('Room not connected')
    }
    return currentRoom as Room
  }

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
    const tracks = participantTracking.getTracks(participant.identity)

    return {
      identity: participant.identity,
      name: participant.name || options.participantName,
      metadata: participant.metadata ? JSON.parse(participant.metadata) : options.participantMetadata,
      isCameraEnabled: participant.isCameraEnabled,
      isMicrophoneEnabled: participant.isMicrophoneEnabled,
      isScreenShareEnabled: participant.isScreenShareEnabled,
      audioLevel: audioLevel.value,
      connectionQuality: 'excellent', // Local participant always has excellent quality
      tracks
    }
  })

  const remoteParticipants = computed((): LiveKitParticipant[] => {
    if (!room.value) return []

    // Use our reactive participant list to trigger updates
    const participantIds = Array.from(participantTracking.remoteParticipantIdentities.value)
    return participantIds.map((identity) => {
      const participant = room.value!.remoteParticipants.get(identity)
      if (!participant) return null
      const tracks = participantTracking.getTracks(participant.identity)
      const quality = participantConnectionQuality.value.get(participant.identity)
      const audioLevelValue = audioMonitoring.getLevel(participant.identity)

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
        audioLevel: audioLevelValue,
        connectionQuality,
        tracks
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
      eventEmitter.emit('connected')
    })

    roomInstance.on(RoomEvent.Disconnected, (reason) => {
      connectionState.value = ConnectionState.Disconnected
      roomState.value = roomInstance.state
      clearParticipantState()
      eventEmitter.emit('disconnected', reason)
    })

    roomInstance.on(RoomEvent.Reconnecting, () => {
      connectionState.value = ConnectionState.Reconnecting
      eventEmitter.emit('reconnecting')
    })

    roomInstance.on(RoomEvent.Reconnected, () => {
      connectionState.value = ConnectionState.Connected
      roomState.value = roomInstance.state
      error.value = null
      eventEmitter.emit('reconnected')
    })

    roomInstance.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      participantTracking.addParticipant(participant.identity)
      eventEmitter.emit('participantConnected', participant)
    })

    roomInstance.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      participantTracking.removeParticipant(participant.identity)
      participantConnectionQuality.value.delete(participant.identity)
      audioMonitoring.cleanupAnalyser(participant.identity)
      eventEmitter.emit('participantDisconnected', participant)
    })

    roomInstance.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: TrackPublication, participant: RemoteParticipant) => {
      participantTracking.updateTracks(participant.identity, track, publication.source, 'add')

      if (publication.kind === Track.Kind.Video) {
        participantTracking.addPublication(participant.identity, publication as RemoteTrackPublication, publication.source)
      }

      audioMonitoring.setupMonitoring(track, participant.identity)
      eventEmitter.emit('trackSubscribed', track, publication, participant)
    })

    roomInstance.on(RoomEvent.TrackMuted, (publication: TrackPublication, participant: Participant) => {
      if (publication.kind === Track.Kind.Video && publication.track && publication.source === Track.Source.Camera) {
        participantTracking.updateTracks(participant.identity, publication.track as RemoteTrack | LocalVideoTrack, publication.source, 'remove')
      } else if (publication.kind === Track.Kind.Audio && publication.track) {
        participantTracking.updateTracks(participant.identity, publication.track as RemoteTrack | LocalAudioTrack, publication.source, 'add')
      }
      eventEmitter.emit('trackMuted', publication, participant)
    })

    roomInstance.on(RoomEvent.TrackUnmuted, (publication: TrackPublication, participant: Participant) => {
      if (publication.kind === Track.Kind.Video && publication.track && publication.source === Track.Source.Camera) {
        participantTracking.updateTracks(participant.identity, publication.track as RemoteTrack | LocalVideoTrack, publication.source, 'add')
        if (participant === roomInstance.localParticipant) {
          audioMonitoring.setupMonitoring(publication.track as LocalVideoTrack, participant.identity)
        }
      } else if (publication.kind === Track.Kind.Audio && publication.track) {
        participantTracking.updateTracks(participant.identity, publication.track as RemoteTrack | LocalAudioTrack, publication.source, 'add')
      }
      eventEmitter.emit('trackUnmuted', publication, participant)
    })

    roomInstance.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: TrackPublication, participant: RemoteParticipant) => {
      participantTracking.updateTracks(participant.identity, track, publication.source, 'remove')
      if (track.kind === Track.Kind.Audio) {
        audioMonitoring.cleanupAnalyser(participant.identity)
      }
      eventEmitter.emit('trackUnsubscribed', track, publication, participant)
    })

    roomInstance.on(RoomEvent.LocalTrackPublished, (publication: TrackPublication, participant: LocalParticipant) => {
      if (publication.track) {
        participantTracking.updateTracks(participant.identity, publication.track as LocalAudioTrack | LocalVideoTrack, publication.source, 'add')
        audioMonitoring.setupMonitoring(publication.track as LocalAudioTrack | LocalVideoTrack, participant.identity)
      }
      updateLocalMediaState()
      eventEmitter.emit('localTrackPublished', publication, participant)
    })

    roomInstance.on(RoomEvent.LocalTrackUnpublished, (publication: TrackPublication, participant: LocalParticipant) => {
      if (publication.track) {
        participantTracking.updateTracks(participant.identity, publication.track as LocalAudioTrack | LocalVideoTrack, publication.source, 'remove')
        if (publication.track.kind === Track.Kind.Audio) {
          audioMonitoring.cleanupAnalyser(participant.identity)
        }
      }
      updateLocalMediaState()
      eventEmitter.emit('localTrackUnpublished', publication, participant)
    })

    roomInstance.on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, participant: Participant) => {
      participantConnectionQuality.value.set(participant.identity, quality)
      eventEmitter.emit('connectionQualityChanged', quality, participant)
    })

    roomInstance.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      // Reset all levels
      const currentLevels = audioMonitoring.audioLevels.value
      currentLevels.forEach((_, identity) => {
        audioMonitoring.setLevel(identity, 0)
      })

      speakers.forEach((speaker) => {
        const level = Math.round((speaker.audioLevel ?? 0) * 100)
        audioMonitoring.setLevel(speaker.identity, level)

        if (speaker.identity === roomInstance.localParticipant.identity) {
          audioLevel.value = level
        }
      })

      if (speakers.length === 0 && roomInstance.localParticipant) {
        audioLevel.value = 0
      }
    })
  }

  // Update local media state
  function updateLocalMediaState() {
    if (!room.value?.localParticipant) return

    const participant = room.value.localParticipant
    isCameraEnabled.value = participant.isCameraEnabled
    isMicrophoneEnabled.value = participant.isMicrophoneEnabled
    isScreenShareEnabled.value = participant.isScreenShareEnabled
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

      // Initialize participant list with existing participants and their tracks
      room.value.remoteParticipants.forEach((participant) => {
        participantTracking.addParticipant(participant.identity)

        // Add already-subscribed tracks for this participant
        participant.trackPublications.forEach((publication) => {
          if (publication.track && publication.isSubscribed) {
            participantTracking.updateTracks(
              participant.identity,
              publication.track as RemoteTrack,
              publication.source,
              'add'
            )

            // Add video publications for quality control
            if (publication.kind === Track.Kind.Video) {
              participantTracking.addPublication(
                participant.identity,
                publication as RemoteTrackPublication,
                publication.source
              )
            }
          }
        })
      })

      // Refresh devices after connection
      await deviceManagement.refreshDevices()
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
        deviceId: deviceManagement.selectedCamera.value || undefined
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
        deviceId: deviceManagement.selectedMicrophone.value || undefined
      }
      await currentRoom.localParticipant.setMicrophoneEnabled(true, options)
    } else {
      await currentRoom.localParticipant.setMicrophoneEnabled(false)
    }

    updateLocalMediaState()
  }

  async function enableScreenShare(enabled = true): Promise<void> {
    const currentRoom = getRoomOrThrow()
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
      } catch {
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
  }

  // Device management - delegate to deviceManagement composable
  async function refreshDevices(): Promise<void> {
    await deviceManagement.refreshDevices()
  }

  async function switchCamera(deviceId: string): Promise<void> {
    await deviceManagement.switchCamera(room.value as Room | null, deviceId)
  }

  async function switchMicrophone(deviceId: string): Promise<void> {
    await deviceManagement.switchMicrophone(room.value as Room | null, deviceId, isMicrophoneEnabled.value)
  }

  async function switchSpeaker(deviceId: string): Promise<void> {
    await deviceManagement.switchSpeaker(room.value as Room | null, deviceId)
  }

  // Track getters - delegate to participantTracking composable
  function getParticipantTracks(participantIdentity: string): ParticipantTracks {
    return participantTracking.getTracks(participantIdentity)
  }

  function getVideoTrack(participantIdentity: string, source: 'camera' | 'screen_share' = 'camera'): RemoteVideoTrack | LocalVideoTrack | undefined {
    return participantTracking.getVideoTrack(participantIdentity, source)
  }

  function getAudioTrack(participantIdentity: string): RemoteAudioTrack | LocalAudioTrack | undefined {
    return participantTracking.getAudioTrack(participantIdentity)
  }

  function getScreenShareAudioTrack(participantIdentity: string): RemoteAudioTrack | LocalAudioTrack | undefined {
    return participantTracking.getScreenShareAudioTrack(participantIdentity)
  }

  function getVideoPublication(participantIdentity: string, source: 'camera' | 'screen_share' = 'camera'): RemoteTrackPublication | undefined {
    return participantTracking.getVideoPublication(participantIdentity, source)
  }

  function setVideoQuality(participantIdentity: string, quality: VideoQuality, source: 'camera' | 'screen_share' = 'camera'): void {
    const publication = getVideoPublication(participantIdentity, source)
    if (publication && 'setVideoQuality' in publication) {
      try {
        publication.setVideoQuality(quality)
      } catch {
        // Failed to set quality - ignore
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
    cameras: deviceManagement.cameras,
    microphones: deviceManagement.microphones,
    speakers: deviceManagement.speakers,
    selectedCamera: deviceManagement.selectedCamera,
    selectedMicrophone: deviceManagement.selectedMicrophone,
    selectedSpeaker: deviceManagement.selectedSpeaker,
    supportsSpeakerSelection: deviceManagement.supportsSpeakerSelection,

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
    on: eventEmitter.on,
    off: eventEmitter.off
  }
}
