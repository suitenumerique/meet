import { ProcessorWrapper } from '@livekit/track-processors'
import { ProcessorType } from '@/features/rooms/livekit/components/blur'
import { BackgroundCustomProcessor } from '@/features/rooms/livekit/components/blur/BackgroundCustomProcessor'
import { FaceLandmarksProcessor } from '@/features/rooms/livekit/components/blur/FaceLandmarksProcessor'
import { UnifiedBackgroundTrackProcessor } from '@/features/rooms/livekit/components/blur/UnifiedBackgroundTrackProcessor'
import type { BenchContender } from './types'

const BLUR_RADIUS = 10
const VIRTUAL_BACKGROUND_PATH = '/assets/backgrounds/1.jpg'

const describeWrapperPath = (): string =>
  ProcessorWrapper.hasModernApiSupport
    ? 'MediaStreamTrackProcessor path'
    : 'canvas.captureStream fallback path'

/**
 * The processors this harness can measure.
 *
 * Anything implementing livekit's TrackProcessor belongs here — background
 * blur today, an animal-face filter tomorrow. Adding a contender is one
 * entry; the protocol and the metrics come for free.
 */
export const BENCH_CONTENDERS: BenchContender[] = [
  {
    id: 'livekit-blur',
    label: 'LiveKit blur',
    description: `@livekit/track-processors background blur, radius ${BLUR_RADIUS}`,
    create: () =>
      new UnifiedBackgroundTrackProcessor({
        type: ProcessorType.BLUR,
        blurRadius: BLUR_RADIUS,
      }),
    describe: describeWrapperPath,
  },
  {
    id: 'livekit-virtual',
    label: 'LiveKit virtual background',
    description: '@livekit/track-processors virtual background',
    create: () =>
      new UnifiedBackgroundTrackProcessor({
        type: ProcessorType.VIRTUAL,
        imagePath: VIRTUAL_BACKGROUND_PATH,
      }),
    describe: describeWrapperPath,
  },
  {
    id: 'custom-canvas-blur',
    label: 'Custom canvas blur (CPU fallback)',
    description:
      'In-house Canvas2D blur used where track-processors is unsupported',
    create: () =>
      new BackgroundCustomProcessor({
        type: ProcessorType.BLUR,
        blurRadius: BLUR_RADIUS,
      }),
  },
  {
    id: 'face-landmarks',
    label: 'Face landmarks filter',
    description: 'MediaPipe face landmarker drawing glasses overlays',
    create: () =>
      new FaceLandmarksProcessor({
        showGlasses: true,
        showFrench: false,
      }),
  },
]
