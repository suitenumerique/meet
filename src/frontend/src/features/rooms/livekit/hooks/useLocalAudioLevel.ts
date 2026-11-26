import { useEffect, useState } from 'react'

const SPEAKING_THRESHOLD = 0.01

type UseLocalAudioLevelOptions = {
  deviceId?: string
  enabled: boolean
}

/**
 * Reads the selected microphone locally while the room microphone stays muted.
 *
 * This preview is local-only: the MediaStream is never published to LiveKit.
 * Capture is stopped when preview is disabled, the selected device changes,
 * or the component unmounts.
 */
export const useLocalAudioLevel = ({
  deviceId,
  enabled,
}: UseLocalAudioLevelOptions) => {
  const [isSpeaking, setIsSpeaking] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setIsSpeaking(false)
      return
    }

    let stream: MediaStream | undefined
    let audioContext: AudioContext | undefined
    let source: MediaStreamAudioSourceNode | undefined
    let analyser: AnalyserNode | undefined
    let animationFrameId: number | undefined
    let cancelled = false

    const cleanup = () => {
      if (animationFrameId !== undefined) {
        cancelAnimationFrame(animationFrameId)
      }

      source?.disconnect()
      analyser?.disconnect()
      stream?.getTracks().forEach((track) => track.stop())

      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close()
      }
    }

    const startPreview = async () => {
      try {
        const audioConstraints: MediaTrackConstraints | boolean =
          deviceId && deviceId !== 'default'
            ? { deviceId: { exact: deviceId } }
            : true

        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: false,
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        audioContext = new AudioContext()

        if (audioContext.state === 'suspended') {
          await audioContext.resume()
        }

        source = audioContext.createMediaStreamSource(stream)
        analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.7

        source.connect(analyser)

        const data = new Uint8Array(analyser.fftSize)

        const updateLevel = () => {
          if (cancelled || !analyser) return

          analyser.getByteTimeDomainData(data)

          let sum = 0
          for (const sample of data) {
            const normalized = (sample - 128) / 128
            sum += normalized * normalized
          }

          const rms = Math.sqrt(sum / data.length)

          setIsSpeaking(rms > SPEAKING_THRESHOLD)
          animationFrameId = requestAnimationFrame(updateLevel)
        }

        updateLevel()
      } catch {
        cleanup()

        if (!cancelled) {
          setIsSpeaking(false)
        }
      }
    }

    void startPreview()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [deviceId, enabled])

  return isSpeaking
}
