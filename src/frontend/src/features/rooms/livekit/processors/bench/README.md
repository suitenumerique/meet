# Track processor benchmark

A dev-only harness that measures any livekit `TrackProcessor<Track.Kind>` under an
identical protocol, so two implementations can be compared on the same machine in
the same session.

## Running it

```bash
npm run dev
```

Open <http://localhost:3000/processor-bench>, tick the processors to compare, press
**Run benchmark** and grant camera access. The route only exists in dev builds:
`import.meta.env.DEV` is inlined as `false` for production, so the branch and the
chunk it imports are dropped from `dist` entirely.

## Protocol

One `getUserMedia` track is acquired and shared by every run, then per processor:

1. clone the source track (the modern processor path consumes the track it is given,
   so contenders must never share one)
2. create a fresh `<video>` element, with no source attached yet
3. `init()` the processor against that bare element
4. only now attach the cloned track to the element and play it
5. wait for the first frame on `processedTrack`
6. warm up
7. measure for the configured window
8. `destroy()`, stop the clone, discard the elements, cool down

Steps 2–4 mirror `LocalVideoTrack.setProcessor` and the order is a contract, not a
detail. Processors such as `BackgroundCustomProcessor` and `FaceLandmarksProcessor`
finish `init()` by registering `onloadeddata` to start their render loop:

```ts
if (this.videoElementLoaded) { startTimer() } else { videoElement.onloadeddata = ... }
```

Attach the source before `init()` and that event has already fired, so the loop never
starts, the canvas is never drawn to, and the processor emits nothing but black. Reusing
one element across runs causes the same failure for the second contender onwards, which
is why each run gets a fresh pair.

Passes alternate direction — forward, then reversed — so thermal drift and model-cache
warmth do not systematically favour whoever ran first. Steady-state metrics are averaged
across passes; startup is reported separately as cold (first run, model download included)
and warm (later runs).

## Metrics

All of them are black-box, observed on the output track and the main thread, which is
what keeps the harness processor-agnostic.

| Metric              | Meaning                                                                                        | Availability                      |
| ------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------- |
| FPS, frame p95      | frames delivered on `processedTrack` and their pacing                                          | needs `requestVideoFrameCallback` |
| rAF p50 / p95       | an independent animation loop's cadence — a proxy for how janky the rest of the app would feel | everywhere                        |
| Blocking (ms)       | Total Blocking Time: each long task's excess over 50ms                                         | Chromium                          |
| Long tasks, Busy %  | count of >50ms tasks, and the share of the window spent in them                                | Chromium                          |
| Startup cold / warm | `init()` until the first frame leaves the processor                                            | everywhere                        |
| Heap peak           | sampled `performance.memory`, a leak smell test rather than a measurement                      | Chromium                          |

GPU time is not measured — there is no portable API for it — and neither are the internals
of any processor. Compare rows only when their notes agree: a processor that self-tunes at
startup reports what it settled on via `describe()`.

## Machine specs

Every report captures the machine that produced it, shown in a panel on the page and
embedded in the JSON: CPU cores, device memory, OS and architecture, browser version,
GPU vendor and renderer (WebGPU `adapter.info` when available, else the WebGL
`WEBGL_debug_renderer_info` strings), WebGL2 and WebGPU availability, screen size and
pixel ratio, timezone, and battery charging state — a laptop on battery throttles hard
enough to invalidate a comparison against one on mains.

## Did a processor use the GPU?

Two columns, and they are not equally strong:

- **Rendering** is _observed_. `CanvasContextRecorder` patches
  `HTMLCanvasElement.prototype.getContext` for the duration of each run and records the
  context types the processor actually created: `webgl`/`webgl2` means it rendered on the
  GPU, `2d` means it did not. This is real per-run evidence.
- **Inference (requested)** is _declared_. It is what the contender asks MediaPipe for —
  `@livekit/track-processors` defaults to `delegate: 'GPU'`, `BackgroundCustomProcessor`
  hardcodes `'CPU'`, `FaceLandmarksProcessor` hardcodes `'GPU'`. MediaPipe never reports
  the delegate it settled on and can fall back to CPU silently, so this is a request and
  is labelled as one. Never read it as proof.

### Running without a GPU at all

Neither column can be changed from inside the page: forcing a delegate would only move
MediaPipe inference, while WebGL rendering and browser compositing stay hardware
accelerated. For a genuinely GPU-less run:

```bash
make run-frontend-development   # in one shell
make run-frontend-nogpu         # in another
```

That launches Chrome with `--disable-gpu` against a throwaway profile. The profile is
mandatory: with the default profile, if Chrome is already running the second launch just
opens a tab in the existing process and the flag is **silently ignored** — you would get
an ordinary GPU run that looks like a GPU-less one. The specs panel closes that loop, so
check it says _software rendering_ before trusting the numbers.

## Adding a processor

One entry in `contenders.ts`:

```ts
{
  id: 'my-filter',
  label: 'My filter',
  description: 'What it does',
  create: () => new MyFilterProcessor({ ... }),
  // optional: what it asks MediaPipe for, omitted if it does no inference
  inferenceDelegate: 'GPU',
  // optional, for anything decided at runtime (model picked, GPU vs CPU path)
  describe: (processor) => `...`,
}
```

Nothing else changes: the protocol and the metrics apply to whatever the entry constructs.

## Tests

`stats.ts` and `sequencing.ts` are pure and unit-tested (`npm run test`) — the latter pins the
init-before-attach ordering and the abort behaviour described above. The collectors and the page
need a real camera, GPU and compositor, so they are verified by running the page.
