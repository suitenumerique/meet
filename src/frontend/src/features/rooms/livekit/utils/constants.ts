export const VOICE_AUDIO_CONSTRAINTS = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  voiceIsolation: false,
  sampleRate: 48000,
  channelCount: 1,
  sampleSize: 16,
} as const
