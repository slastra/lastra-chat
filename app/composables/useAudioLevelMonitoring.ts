import { Track } from 'livekit-client'
import type { RemoteTrack, LocalAudioTrack, LocalVideoTrack, RemoteAudioTrack } from 'livekit-client'

interface AnalyserState {
  audioEl: HTMLMediaElement
  ctx: AudioContext
  src: MediaElementAudioSourceNode
  analyser: AnalyserNode
  raf?: number
}

export function useAudioLevelMonitoring() {
  const audioLevels = ref<Map<string, number>>(new Map())
  const analysers: Map<string, AnalyserState> = new Map()

  function cleanupAnalyser(identity: string) {
    const state = analysers.get(identity)
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
      analysers.delete(identity)
    }

    audioLevels.value.delete(identity)
  }

  function setupMonitoring(track: RemoteTrack | LocalAudioTrack | LocalVideoTrack, participantIdentity: string) {
    if (track.kind === Track.Kind.Audio) {
      const audioTrack = track as RemoteAudioTrack | LocalAudioTrack

      // Ensure prior analysers are cleaned before creating a new one
      cleanupAnalyser(participantIdentity)

      // Try to attach the track to a hidden audio element and measure amplitude via WebAudio
      try {
        // Prefer using the raw MediaStreamTrack (if available) as source for analyser
        const maybeMediaStreamTrack = (audioTrack as unknown as { mediaStreamTrack?: MediaStreamTrack }).mediaStreamTrack
        // Look up AudioContext constructor (handle vendor prefixes)
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const AudioCtxCtor = (window as any).AudioContext || (window as any).webkitAudioContext
        /* eslint-enable @typescript-eslint/no-explicit-any */
        if (!AudioCtxCtor) {
          // bail out - rely on ActiveSpeakersChanged fallback
          audioLevels.value.set(participantIdentity, 0)
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
              (p as Promise<void>).catch(() => {
                // Audio play rejected - ignore
              })
            }
          } catch {
            // Audio play failed - ignore
          }

          src = ctx.createMediaElementSource(audioEl)
          analyser = ctx.createAnalyser()
          analyser.fftSize = 512
          src.connect(analyser)
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
          audioLevels.value.set(participantIdentity, level)

          const raf = requestAnimationFrame(tick)
          const state = analysers.get(participantIdentity)
          if (state) state.raf = raf
        }

        analysers.set(participantIdentity, { audioEl: audioEl as HTMLMediaElement, ctx, src: src as MediaElementAudioSourceNode, analyser, raf: undefined })
        tick()

        // Clean up when track ends
        audioTrack.on('ended', () => {
          cleanupAnalyser(participantIdentity)
        })
      } catch {
        // Fallback: leave levels to ActiveSpeakersChanged if analyser fails
        audioLevels.value.set(participantIdentity, 0)
        audioTrack.on('ended', () => {
          cleanupAnalyser(participantIdentity)
        })
      }
    }
  }

  function clearAll() {
    Array.from(analysers.keys()).forEach(cleanupAnalyser)
    audioLevels.value.clear()
  }

  function getLevel(identity: string): number {
    return audioLevels.value.get(identity) || 0
  }

  function setLevel(identity: string, level: number) {
    audioLevels.value.set(identity, level)
  }

  return {
    audioLevels: readonly(audioLevels),
    setupMonitoring,
    cleanupAnalyser,
    clearAll,
    getLevel,
    setLevel
  }
}
