export const canTestAudioOutput = () =>
  typeof HTMLMediaElement !== 'undefined' &&
  'setSinkId' in HTMLMediaElement.prototype // Safari: no output routing
