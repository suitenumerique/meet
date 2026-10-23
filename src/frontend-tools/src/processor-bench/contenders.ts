import {
  BackgroundProcessorFactory,
  ProcessorType,
} from '@/features/rooms/livekit/components/blur'
import { BackgroundCustomProcessor } from '@/features/rooms/livekit/components/blur/BackgroundCustomProcessor'
import { FaceLandmarksProcessor } from '@/features/rooms/livekit/components/blur/FaceLandmarksProcessor'
import { UnifiedBackgroundTrackProcessor } from '@/features/rooms/livekit/components/blur/UnifiedBackgroundTrackProcessor'
import type { BenchContender } from './types'

const BLUR_RADIUS = 10
const VIRTUAL_BACKGROUND_PATH = '/assets/backgrounds/1.jpg'

// Via the factory rather than ProcessorWrapper directly, so @livekit/track-processors
// stays behind the components/blur boundary.
const describeWrapperPath = (): string =>
  BackgroundProcessorFactory.hasModernApiSupport()
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
    // track-processors defaults its ImageSegmenter to delegate: 'GPU' and
    // spreads any segmenterOptions after it; we pass none.
    inferenceDelegate: 'GPU',
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
    inferenceDelegate: 'GPU',
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
    // Hardcoded to CPU: it exists for browsers without track-processors.
    inferenceDelegate: 'CPU',
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
    // Hardcoded to GPU in FaceLandmarksProcessor.initFaceLandmarker.
    inferenceDelegate: 'GPU',
  },
]
