import { useEffect, useState } from 'react'

/**
 * Monitors audio level from a specific input device using the Web Audio API.
 * Unlike LiveKit's useIsSpeaking (which requires a published track),
 * this hook captures audio directly from getUserMedia, so it works
 * even when the microphone track is muted/unpublished.
 */
export const useLocalAudioLevel = (
  deviceId: string | undefined
): boolean => {
  const [isSpeaking, setIsSpeaking] = useState(false)

  useEffect(() => {
    if (!deviceId) return

    let audioContext: AudioContext | undefined
    let analyser: AnalyserNode | undefined
    let stream: MediaStream | undefined
    let animationFrameId: number | undefined
    let cancelled = false

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId },
        })
      } catch {
        return
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      try {
        audioContext = new AudioContext()
        const source = audioContext.createMediaStreamSource(stream)
        analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
      } catch {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      const dataArray = new Uint8Array(analyser.fftSize)

      const poll = () => {
        if (cancelled) return

        analyser!.getByteTimeDomainData(dataArray)

        // Compute RMS volume from time-domain data (values centered at 128)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128
          sum += normalized * normalized
        }
        const rms = Math.sqrt(sum / dataArray.length)

        setIsSpeaking(rms > 0.01)

        animationFrameId = requestAnimationFrame(poll)
      }

      poll()
    }

    start()

    return () => {
      cancelled = true
      if (animationFrameId != null) {
        cancelAnimationFrame(animationFrameId)
      }
      stream?.getTracks().forEach((t) => t.stop())
      void audioContext?.close()
    }
  }, [deviceId])

  return isSpeaking
}
