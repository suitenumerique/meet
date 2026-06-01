# Background Segmentation & Compositing Pipeline

## 1. Introduction

This folder implements the real-time background processing pipeline used by the
Meet video pipeline. Two user-facing effects are supported through a single
shared engine:

- **Background blur** — the camera frame is composited on top of a blurred copy
  of itself so the participant stays sharp while their surroundings melt away.
- **Virtual background** — the camera frame is composited on top of an
  arbitrary image so the participant appears in a different scene.

Both effects share the same problem: given a live video frame, recover a clean
alpha matte that separates the person from the background, then composite the
two layers as fast as the camera can deliver frames. In practice this is
constrained by several hard requirements that drive the entire design:

- **Cross-browser** — must run in Chromium, Firefox and Safari.
- **Real time** — target ≥30 fps on commodity laptops, never blocking the
  camera's native cadence.
- **Resilience** — when anything fails (model load, WebGL2 init, segmenter
  timeout), the user must still see *something* — never a frozen frame.
- **Quality** — the segmenter operates at low resolution (256×144 or 256×256)
  but the output runs at the camera's native resolution (typically 1280×720),
  so the mask has to be upsampled and refined without producing visible
  halos or seams.

The pipeline is orchestrated by [AdvancedMattingProcessor.ts](AdvancedMattingProcessor.ts),
which implements the LiveKit `TrackProcessor` interface and exposes a
processed `MediaStreamTrack` to the rest of the application.

---

## 2. Pipeline Diagram

The two loops on either side of the diagram run independently. They meet at
the shared `_latestPair` slot: the segmenter loop writes it, the render loop
reads it. After that point, the rest of the pipeline runs entirely inside the
render loop on the GPU.

Each box shows: what the step does, why it exists, which loop and processor it
runs on (`[seg·CPU]` = segmenter loop on CPU, `[rnd·GPU]` = render loop on
GPU), and a reference to the relevant §3.x section for deeper detail.
```

                   ┌────────────────────────────────────────┐
                   │   <video> element (camera)             │
                   │   full-res RGBA, camera framerate      │
                   └────────────────────┬───────────────────┘
                                        │
                        ┌───────────────┴────────────────┐
                        │                                │
                   SEGMENTER LOOP                  RENDER LOOP
               (async while, rVFC-paced)        (requestAnimationFrame)
                        │                                │
                        ▼                                │
      ┌─────────────────────────────────────────────┐    │
      │ ATOMIC SNAPSHOT                  [seg·CPU]  │    │
      │ What: sync drawImage(videoEl) into a hidden │    │
      │       canvas; derive both segmenter input   │    │
      │       and renderer bitmap from that canvas  │    │
      │ Why:  async capture would let them drift    │    │
      │       → mask misaligned with frame → halo   │    │
      └──────────────┬───────────────┬──────────────┘    │
                     │               │                   │
                     ▼               ▼                   │
   ┌──────────────────────┐  ┌───────────────────────┐   │
   │ MOTION CHECK         │  │ PREPROCESSING         │   │
   │           [seg·CPU]  │  │       [seg·CPU]  §3.2 │   │
   │ What: compare 128×72 │  │ What: crop snapshot   │   │
   │  luma thumbnails     │  │  to tracked ROI bbox  │   │
   │  outside bbox every  │  │  and downsample to    │   │
   │  30 frames. Expands  │->│  256×N model input    │   │
   │  bbox to full-frame  │  │ Why:  person fills    │   │
   │  if big changes found│  │  more of the input →  │   │   
   │ Why:  detect new     │  │  better edge quality  │   │
   │  people entering     │  └──────────┬────────────┘   │
   │  without periodic    │             │                │
   │  full-frame runs §3.2│             │                │
   └──────────────────────┘             │                │
                                        ▼                │
      ┌─────────────────────────────────────────────┐    │
      │ SEGMENTATION                     [seg·GPU]  │    │
      │ What: Mediapipe inference on 256×N frame →  │    │
      │       float mask (1 = person, 0 = bg)       │    │
      │ Why:  core separation; GPU delegate +       │    │
      │       auto benchmark select fastest   §3.3  │    │
      └──────────────────────┬──────────────────────┘    │
                             ▼                           │
      ┌─────────────────────────────────────────────┐    │
      │ CPU POSTPROCESS                  [seg·CPU]  │    │
      │ What: paste crop-space mask into full-frame │    │
      │       coords; update tracked bbox           │    │
      │ Why:  downstream needs full-frame mask;     │    │
      │       dead-zone stabilises bbox       §3.2  │    │
      └──────────────────────┬──────────────────────┘    │
                             │ writes pair               │ reads pair
                             │                           │
                             └──────────┐         ┌──────┘
                                        │         │
                                        ▼         ▼
                  ┌─────────────────────────────────────────────┐
                  │ _latestPair                  [shared slot]  │
                  │ What: { mask, source: ImageBitmap,          │
                  │         captureTime, procW, procH }         │
                  │       written by segmenter, read by         │
                  │       renderer                              │
                  │ Why:  decouples loops so the renderer       │
                  │       never blocks on inference       §3.1  │
                  └──────────────────────┬──────────────────────┘
                                         │
                                         ▼
                  ┌─────────────────────────────────────────────┐
                  │ GPU MASK POSTPROCESS             [rnd·GPU]  │
                  │ What: morphological opening/closing fills   │
                  │       mask holes; temporal EMA smooths      │
                  │       flicker                               │
                  │ Why:  raw mask has holes between fingers    │
                  │       and "boils" frame-to-frame      §3.4  │
                  └──────────────────────┬──────────────────────┘
                                         │
                                         ▼
                  ┌─────────────────────────────────────────────┐
                  │ UPSAMPLING                       [rnd·GPU]  │
                  │ What: scale 256×N mask to camera res via    │
                  │       guided filter                         │
                  │ Why:  Guided filter snaps edges to RGB image│
                  │                                       §3.5  │
                  └──────────────────────┬──────────────────────┘
                                         │
                                         ▼
                  ┌─────────────────────────────────────────────┐
                  │ BACKGROUND CONSTRUCTION          [rnd·GPU]  │
                  │ What: blur: mask-weighted gaussian at       │
                  │       half-res; virtual: GPU texture        │
                  │ Why:  mask-weighting excludes person pixels │
                  │       from the blur → no halo        §3.6   │
                  └──────────────────────┬──────────────────────┘
                                         │
                                         ▼
                  ┌─────────────────────────────────────────────┐
                  │ COMPOSITE                        [rnd·GPU]  │
                  │ What: blur: erode mask inline to shrink     │
                  │       silhouette, then mix(bg, video, mask) │
                  │       virtual: edge decontamination +       │
                  │       colour cast correction (no erosion)   │
                  │ Why:  inline erosion hides residual halo    │
                  │       where mask doesn't align to RGB edge; │
                  │       virtual bg needs richer path   §3.7   │
                  └──────────────────────┬──────────────────────┘
                                         │
                                         ▼
                  ┌─────────────────────────────────────────────┐
                  │ OUTPUT CANVAS                               │
                  │ What: captureStream(30) wraps rendered      │
                  │       canvas as a MediaStreamTrack          │
                  │ Why:  LiveKit publishes tracks, not         │
                  │       canvases; this bridges the two        │
                  └─────────────────────────────────────────────┘
```

The two loops are intentionally decoupled. The render loop never blocks on
inference; if no fresh mask is available it either reuses the last one or
falls back to a passthrough mask filled with 1.0 (which composites the camera
unchanged). This is what guarantees the user always sees a live frame even if
the segmenter stalls.

---

## 3. Technique Details

### 3.1 Two-loop engine — [AdvancedMattingProcessor.ts](AdvancedMattingProcessor.ts)

**Problem.** Mediapipe inference is asynchronous and can spike beyond one
frame period on slower devices. If the render path waits on it, the camera
output stutters or freezes. A second problem is spatial drift: if the
segmenter runs on one video frame while the renderer composites a later frame,
the mask is slightly misaligned with the frame it is applied to, creating
halos at fast-moving edges.

**How it works.** Two independent loops share a single `_latestPair`
reference (`FrameMaskPair`):

- The **segmenter loop** is an `async while` paced by
  `VideoFrameTracker.waitNextFrame()`, which resolves on
  `requestVideoFrameCallback` ticks — i.e. the camera's native cadence.
  When rVFC is unavailable the loop falls back to a 60 Hz `setTimeout`.
  Each iteration does a **sync** `drawImage(videoElement)` into a
  `_snapshotCanvas` — this is the atomic instant that locks the frame. The
  segmenter input is downsampled from that snapshot, and the renderer bitmap
  is `createImageBitmap(snapshot, {imageOrientation: 'flipY'})` of the same
  snapshot. After inference and postprocessing, the loop publishes the pair
  `{mask, source: ImageBitmap, captureTime, procW, procH}` atomically and
  closes the previous bitmap. The `flipY` flag is baked into the bitmap
  because `UNPACK_FLIP_Y_WEBGL` is unreliable for `ImageBitmap` across
  browsers.
- The **render loop** is a `requestAnimationFrame` callback that reads
  `_latestPair` and composites unconditionally. It never awaits the
  segmenter. It always renders against `pair.source` (the captured bitmap) —
  **frame-locked**, zero temporal halo.

The output `<canvas>` is wrapped with `captureStream(30)` to produce the
`MediaStreamTrack` that LiveKit publishes.

### 3.2 ROI cropping — [preprocessing/RoiCropper.ts](preprocessing/RoiCropper.ts)

**Problem.** Sending the full 1280×720 frame to a 256×256 model wastes
resolution on regions that do not contain the person. The model is
disproportionately accurate when the person fills the input.

**How it works.**
1. On each inference, scan the previous full-frame mask, compute the tight
   bounding box of pixels above 0.5, expand it by 8 % padding, and clamp to
   `[0, 1]`.
2. Apply a dead zone (3 % of frame on position, 1.5 % on size). If the new
   bbox falls within the dead zone of the current one it is ignored; otherwise
   the new bbox is applied directly (hard snap, no blending). This kills
   small-motion jitter that would otherwise make the crop "breathe".
3. Every 30 frames (`MOTION_CHECK_INTERVAL`), check for motion **outside**
   the current bbox using a 128×72 downsampled luma frame (`_motionCanvas`).
   Each pixel's luma is compared against the previous frame's luma buffer;
   if more than 1/16 of all pixels changed by more than 25 luma units
   (`MOTION_DIFF_THRESHOLD`, `MOTION_PIXEL_RATIO`), the bbox expands to the
   full frame immediately. A 30-frame cooldown (`EXPANSION_COOLDOWN_FRAMES`)
   then suppresses the next check, preventing oscillation. This replaces the
   older fixed 45-frame periodic full-frame inference: expansion now only
   happens when the scene outside the tracked person actually changes.
4. After inference, [PreProcessingPipeline.applyAfterInference()](preprocessing/PreProcessingPipeline.ts)
   bilinearly resizes the crop-space mask and pastes it back into a
   zero-filled full-frame Float32Array so the rest of the pipeline always
   sees a mask in full-frame coordinates.

### 3.3 Segmenter selection & GPU delegate probing — [segmenters/](segmenters/)

**Problem.** The multiclass model (256×256, 6 classes) gives noticeably
cleaner edges than the landscape model (256×144, binary), but is heavier.
On CPU-only Mediapipe delegates it spends 80–150 ms per frame, which would
saturate the inference queue and effectively look like a frozen mask.

**How it works.**
- [probeMediapipeDelegate()](segmenters/Segmenter.ts) tries to instantiate an
  `ImageSegmenter` with `delegate: 'GPU'` once per session and memoises the
  result. If it throws, the session falls back to CPU. This replaces an
  older user-agent sniff that incorrectly disabled GPU on Safari 17+.
- In `SegmentationModel.AUTO` mode, [SegmenterBenchmarker](segmenters/SegmenterBenchmarker.ts)
  runs 5 warmup inferences then 15 timed inferences on the multiclass model
  and computes the **p75 latency**. If the GPU delegate probe came back CPU,
  benchmarking is skipped entirely and landscape is used directly. Otherwise
  three outcomes are possible:
  - p75 < 25 ms → keep Multiclass, `frameSkip = 1` (~30 fps inference)
  - 25 ms ≤ p75 ≤ 50 ms → keep Multiclass, `frameSkip = 2` (~15 fps inference)
  - p75 > 50 ms → switch to Landscape
- If Landscape is chosen, the same benchmark runs again to determine its own
  `frameSkip` (threshold: 25 ms).
- Both segmenters return a `Float32Array` mask in `[0, 1]` where 1 = person.
  For multiclass the foreground probability is computed as `1 − bg_prob`
  rather than summing the five "person" classes (faster, equivalent).
- Each `segment()` call races inference against a 2 s timeout — if the model
  hangs, the loop catches and continues rather than wedging the entire
  pipeline.

### 3.4 GPU postprocessing — [renderers/MaskPostProcessor.ts](renderers/MaskPostProcessor.ts)

**Opening (erosion then dilation).** Small isolated speck artefacts can
appear at mask edges (e.g. noise pixels just outside the shoulder). Opening
removes them without shrinking the main silhouette. Implemented as two passes
of a 1D min/max shader.

**Closing (dilation then erosion).** Small holes inside the person mask
(e.g. between fingers or against a similarly-coloured background) become
visible as flickering background showing through the body. Closing fills
holes smaller than the kernel radius without growing the silhouette.
Implemented as two passes of a 1D min/max shader.

**Temporal EMA.** Inference is non-deterministic frame to frame. Even on a
static subject, the silhouette wiggles by ±1–2 pixels each frame, which the
eye reads as boiling. The EMA pass runs `out = α·cur + (1−α)·prev` on a
persistent `emaTex` and damps that high-frequency noise. The first frame
after a config change uses α = 1.0 to avoid the mask appearing to fade in.

### 3.5 Mask upsampling

The segmenter mask lives at processing resolution (256×144 or 256×256),
which is roughly 10× smaller than the camera frame on either axis. How we
upsample directly drives the perceived quality of the silhouette.

- **Guided filter.** [GpuGuidedFilter.ts](renderers/GpuGuidedFilter.ts)
  implements the He et al. (2013) RGB-guided filter entirely in GLSL.
  Conceptually: for each pixel of the high-res output, take the
  bilinearly-upsampled low-res mask `p`, learn an affine model
  `q = a·I + b` that explains `p` from the high-res RGB guide `I` within a
  local window, then box-blur the per-window `(a, b)` and apply.
  In practice, that means separable H+V box-filter passes for four groups of
  statistics (`I`, `I·I`, `I·p`), a 3×3 covariance solve, then a final apply
  pass. All intermediate textures use `RGBA16F`. The effect is that the mask
  edge snaps to actual RGB edges in the video — hair, shoulders, glasses —
  instead of cutting through them at the low-res sample grid. Requires
  `EXT_color_buffer_float`. If that extension is unavailable, the guided
  filter is skipped and the composite shader samples the raw low-res mask
  with `LINEAR` filtering (implicit bilinear upsampling).

### 3.6 Background construction (blur path)

A naive "downsample then gaussian blur then composite" produces a visible
dark halo around the silhouette: when the small downsample pass samples a
3×3 neighbourhood near the person, the person's pixels get averaged into
the "background" output. The halo is the colour of the *person* bleeding
out, not of the background bleeding in.

The fix used here is **mask-weighted blur with weight normalisation**:

1. **Masked downsample** — each output pixel samples a 3×3 area of the
   full-res video, weights every sample by `(1 − mask)`, sums both the
   weighted RGB and the weights, and divides at the end. Pixels that fall
   entirely inside the person contribute zero weight and zero color, so the
   output is whatever the *background* pixels in the neighbourhood looked
   like.
2. **Mask-weighted horizontal gaussian** at half resolution.
3. **Mask-weighted vertical gaussian** at half resolution.

The blur runs at half output resolution because the result is going to be
behind the (soft-edged) person anyway — full-res blur is invisible and
costs 4× the work.

### 3.7 Composite — blur and fallback path

The standard composite shader implements `mix(background, video, mask)`,
with the mask first eroded by `postCfg.erosion.pixels` (sampled per-pixel
via a min over a small neighbourhood directly inside the shader). The
erosion shrinks the visible silhouette by a couple of pixels, hiding any
remaining halo from the mask not perfectly aligning with the RGB edge.

### 3.8 Composite — segmo path (virtual background)

When the mode is `virtual` *and* a virtual background image has finished
uploading to a GPU texture, the renderer switches to a more elaborate
compositor designed to handle the harder case of pasting the person onto a
new scene. The reason this case is harder than blur: the new background has
arbitrary colors, so any leftover halo or color contamination from the old
background becomes obvious instead of being hidden behind a similar-tone
blur of the same frame.

Stages:

1. **Edge feather** (`pSegmoEdgeFeather`) — gaussian-blurs the mask only in
   a narrow band near the silhouette. Widens the transition zone so the
   closed-form matting in the next step has more pixels to operate on,
   without affecting the interior or exterior of the mask.
2. **Foreground masked extraction** (`pMaskedFg`) + **mean colour cast**
   (`pFgColorCast`) — extract the person, then optionally tint the camera
   frame slightly toward the mean colour of the virtual background. The
   means are recovered for free by reading the top mip level of mipmapped
   textures, so no CPU readback is needed.
3. **Segmo composite** (`pCompositeSegmo`) — runs the
   foreground-recovery shader: edge-adaptive sharpening driven by the
   camera gradient, closed-form alpha matting on a 13-tap cross pattern
   inside the feathered transition band, a chroma-aware colour-separation
   gate, and the VFX decontamination equation `output = I + (B_new − B_old) × (1 − α)`
   to subtract the contribution of the original (unknown) background from
   contaminated edge pixels. This intentionally subsumes the erosion step
   from the standard composite.
4. **Light wrap** (`pLightWrap`, optional) — mixes a small fraction of the
   background colour into the foreground edge band so the subject reads as
   lit by the new scene rather than pasted onto it. Skipped when the
   strength is zero.

The blur path and the virtual-no-image fallback never enter this codepath
and run the standard `pComposite` shader instead.

### 3.9 Error handling & resilience — [errors/MattingErrorStore.ts](errors/MattingErrorStore.ts)

Every failure mode that is recoverable converts to an entry in the matting
error store rather than a thrown exception:

- WebGL2 context creation failure → fall back to passing the raw track
  through unchanged.
- Mediapipe init failure → continue rendering with a passthrough mask
  (all-ones) so the user sees their camera; the user can retry by toggling
  the effect off and on.
- Segmenter `segment()` timeout (2 s) → drop the frame, sleep 100 ms,
  continue.
- Virtual background image load failure → keep the blur fallback active.

The render loop is designed so that it can always proceed: if there is no
mask yet, it composites against the passthrough mask, which `mix()`-es to
the raw camera frame.

---

## Key files at a glance

| File | Role |
|---|---|
| [AdvancedMattingProcessor.ts](AdvancedMattingProcessor.ts) | Orchestrator, two-loop engine, segmenter selection, lifecycle |
| [index.ts](index.ts) | Public API: `ProcessorConfig`, `SegmentationModel`, factory |
| [preprocessing/PreProcessingPipeline.ts](preprocessing/PreProcessingPipeline.ts) | Pre/post-inference orchestration |
| [preprocessing/RoiCropper.ts](preprocessing/RoiCropper.ts) | Person-tracking bbox with dead-zone stabilisation and motion-based expansion |
| [segmenters/Segmenter.ts](segmenters/Segmenter.ts) | Shared interface, GPU delegate probe, fileset cache |
| [segmenters/LandscapeSegmenter.ts](segmenters/LandscapeSegmenter.ts) | 256×144 binary selfie segmenter |
| [segmenters/MulticlassSegmenter.ts](segmenters/MulticlassSegmenter.ts) | 256×256 6-class selfie segmenter |
| [segmenters/SegmenterBenchmarker.ts](segmenters/SegmenterBenchmarker.ts) | p75-latency benchmark driving model and frameSkip selection |
| [renderers/GpuRenderer.ts](renderers/GpuRenderer.ts) | Backend-agnostic renderer interface |
| [renderers/WebGl2Renderer.ts](renderers/WebGl2Renderer.ts) | WebGL2 compositor: postprocessing, blur path, segmo path |
| [renderers/MaskPostProcessor.ts](renderers/MaskPostProcessor.ts) | GPU morphology (opening/closing) and temporal EMA |
| [renderers/GpuGuidedFilter.ts](renderers/GpuGuidedFilter.ts) | GPU implementation of guided-filter mask upsampling |
| [errors/MattingErrorStore.ts](errors/MattingErrorStore.ts) | Centralised, non-fatal error reporting |
