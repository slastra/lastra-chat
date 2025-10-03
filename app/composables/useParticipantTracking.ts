import { Track } from 'livekit-client'
import type {
  RemoteTrack,
  LocalAudioTrack,
  LocalVideoTrack,
  RemoteVideoTrack,
  RemoteAudioTrack,
  RemoteTrackPublication
} from 'livekit-client'

export interface ParticipantTracks {
  camera?: RemoteVideoTrack | LocalVideoTrack
  microphone?: RemoteAudioTrack | LocalAudioTrack
  screenShare?: RemoteVideoTrack | LocalVideoTrack
  screenShareAudio?: RemoteAudioTrack | LocalAudioTrack
}

export function useParticipantTracking() {
  const participantTracks = ref<Map<string, ParticipantTracks>>(new Map())
  const participantPublications = ref<Map<string, Map<Track.Source, RemoteTrackPublication>>>(new Map())
  const remoteParticipantIdentities = ref<Set<string>>(new Set())

  function updateTracks(
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

  function addParticipant(identity: string) {
    remoteParticipantIdentities.value.add(identity)
  }

  function removeParticipant(identity: string) {
    remoteParticipantIdentities.value.delete(identity)
    participantPublications.value.delete(identity)
    participantTracks.value.delete(identity)
  }

  function addPublication(identity: string, publication: RemoteTrackPublication, source: Track.Source) {
    if (!participantPublications.value.has(identity)) {
      participantPublications.value.set(identity, new Map())
    }
    const pubMap = participantPublications.value.get(identity)!
    pubMap.set(source, publication)
  }

  function getTracks(participantIdentity: string): ParticipantTracks {
    const tracks = participantTracks.value.get(participantIdentity)
    if (!tracks) return {}
    return tracks as ParticipantTracks
  }

  function getVideoTrack(participantIdentity: string, source: 'camera' | 'screen_share' = 'camera'): RemoteVideoTrack | LocalVideoTrack | undefined {
    const tracks = getTracks(participantIdentity)
    return source === 'camera' ? tracks.camera : tracks.screenShare
  }

  function getAudioTrack(participantIdentity: string): RemoteAudioTrack | LocalAudioTrack | undefined {
    const tracks = getTracks(participantIdentity)
    return tracks.microphone
  }

  function getScreenShareAudioTrack(participantIdentity: string): RemoteAudioTrack | LocalAudioTrack | undefined {
    const tracks = getTracks(participantIdentity)
    return tracks.screenShareAudio
  }

  function getVideoPublication(participantIdentity: string, source: 'camera' | 'screen_share' = 'camera'): RemoteTrackPublication | undefined {
    const pubMap = participantPublications.value.get(participantIdentity)
    if (!pubMap) return undefined
    const sourceKey = source === 'camera' ? Track.Source.Camera : Track.Source.ScreenShare
    return pubMap.get(sourceKey) as RemoteTrackPublication | undefined
  }

  function clearAll() {
    remoteParticipantIdentities.value.clear()
    participantTracks.value.clear()
    participantPublications.value.clear()
  }

  return {
    participantTracks: readonly(participantTracks),
    participantPublications: readonly(participantPublications),
    remoteParticipantIdentities: readonly(remoteParticipantIdentities),
    updateTracks,
    addParticipant,
    removeParticipant,
    addPublication,
    getTracks,
    getVideoTrack,
    getAudioTrack,
    getScreenShareAudioTrack,
    getVideoPublication,
    clearAll
  }
}
