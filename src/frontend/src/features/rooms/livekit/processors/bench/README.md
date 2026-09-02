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
6. wait for `waitForReady()` if the processor exposes it, then warm up
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

## Adding a processor

One entry in `contenders.ts`:

```ts
{
  id: 'my-filter',
  label: 'My filter',
  description: 'What it does',
  create: () => new MyFilterProcessor({ ... }),
  // optional, for anything decided at runtime (model picked, GPU vs CPU path)
  describe: (processor) => `...`,
}
```

Nothing else changes: the protocol and the metrics apply to whatever the entry constructs.

## Tests

`stats.ts` and `sequencing.ts` are pure and unit-tested (`npm run test`) — the latter pins the
init-before-attach ordering and the abort behaviour described above. The collectors and the page
need a real camera, GPU and compositor, so they are verified by running the page.
