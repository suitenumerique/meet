/**
 * Canvas2D fallback renderer used when WebGL2 is unavailable.
 *
 * Called by: AdvancedMattingProcessor._initRendererWithFallback() — used only
 * after WebGl2Renderer.init() throws (no GPU, GPU blacklisted, low-power mode).
 *
 * Pipeline role: Degraded but functional compositor. Implements the same
 * GpuRenderer interface as WebGl2Renderer so the rest of the pipeline is
 * unaware of the fallback. Supports blur (ctx.filter) and virtual background;
 * only honours the temporal EMA from PostProcessingConfig — morphological
 * opening/closing and guided filter upsampling are skipped on this path.
 */
import { PostProcessingConfig } from '..'
import { pushMattingError } from '../errors/MattingErrorStore'
import { GpuRenderer, GpuRendererInitOpts, RenderSource } from './GpuRenderer'

/**
 * Canvas2D fallback renderer. Used when WebGL2 is unavailable (no GPU, GPU
 * blacklisted, browser in low-power mode, etc.). The matting is functional
 * but degraded: no shader-based morphology / guided filter, only a simple
 * CPU temporal EMA on the mask. Blur is done via `ctx.filter = 'blur(Xpx)'`
 * which is acceptable here — the WebGL2 path remains shader-only.
 */
export class Canvas2dRenderer implements GpuRenderer {
  readonly backend = 'canvas2d' as const

  outW = 0
  outH = 0

  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D

  // Mask buffer at processing resolution. The Float32 mask is converted to
  // RGBA8 (alpha channel only) once per uploadMask() and stored here; it is
  // drawn into the output canvas via `globalCompositeOperation = 'destination-in'`
  // at render time, which scales it up bilinearly to outW × outH.
  private maskCanvas!: HTMLCanvasElement
  private maskCtx!: CanvasRenderingContext2D
  private maskImageData!: ImageData
  private procW = 0
  private procH = 0

  // Offscreen scratch canvases — lazy-allocated, recreated on resize.
  private bgCanvas: HTMLCanvasElement | null = null
  private bgCtx: CanvasRenderingContext2D | null = null
  private fgCanvas: HTMLCanvasElement | null = null
  private fgCtx: CanvasRenderingContext2D | null = null

  private mode: 'blur' | 'virtual' = 'blur'
  private blurRadius = 10
  private virtualImg: HTMLImageElement | null = null

  // Simple CPU temporal EMA. `alpha` is the new-frame weight:
  // out = alpha * current + (1 - alpha) * previous. 0 means EMA disabled.
  private emaAlpha = 0
  private emaPrevMask: Float32Array | null = null

  async init(
    canvas: HTMLCanvasElement,
    opts: GpuRendererInitOpts
  ): Promise<void> {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) {
      pushMattingError({
        code: 'WEBGL2_INIT_FAILED',
        level: 'error',
        detail:
          'getContext("2d") returned null — Canvas2D fallback also unavailable',
      })
      throw new Error('Canvas2D unavailable')
    }
    this.canvas = canvas
    this.ctx = ctx
    this.outW = opts.outW
    this.outH = opts.outH
    canvas.width = opts.outW
    canvas.height = opts.outH
    this.ctx.imageSmoothingEnabled = true
    this.ctx.imageSmoothingQuality = 'medium'

    this._allocMaskBuffers(opts.processingW, opts.processingH)
    this.setPostProcessing(opts.postProcessing)
  }

  resizeProcessing(w: number, h: number): void {
    if (w === this.procW && h === this.procH) return
    this._allocMaskBuffers(w, h)
    this.emaPrevMask = null
  }

  resizeOutput(w: number, h: number): void {
    if (w === this.outW && h === this.outH) return
    this.outW = w
    this.outH = h
    this.canvas.width = w
    this.canvas.height = h
    this.ctx.imageSmoothingEnabled = true
    this.ctx.imageSmoothingQuality = 'medium'
    // Drop the lazily-allocated offscreens; they'll be recreated at the new size.
    this.bgCanvas = null
    this.bgCtx = null
    this.fgCanvas = null
    this.fgCtx = null
  }

  uploadMask(mask: Float32Array, w: number, h: number): void {
    if (w !== this.procW || h !== this.procH) {
      this.resizeProcessing(w, h)
    }

    // Optional temporal EMA in CPU. Output overwrites `mask` in place; we keep
    // the smoothed result in `emaPrevMask` for next frame.
    let src = mask
    if (this.emaAlpha > 0 && this.emaAlpha < 1) {
      if (!this.emaPrevMask || this.emaPrevMask.length !== mask.length) {
        this.emaPrevMask = new Float32Array(mask.length)
        this.emaPrevMask.set(mask)
      } else {
        const a = this.emaAlpha
        const inv = 1 - a
        const prev = this.emaPrevMask
        for (let i = 0; i < mask.length; i++) {
          const blended = a * mask[i] + inv * prev[i]
          prev[i] = blended
        }
        src = this.emaPrevMask
      }
    } else {
      this.emaPrevMask = null
    }

    // Pack mask into the alpha channel of the mask ImageData. RGB stays at
    // 255 so a debug-render of the mask canvas would show white silhouette.
    // Composition uses `destination-in` against alpha, so RGB is irrelevant.
    const data = this.maskImageData.data
    for (let i = 0, j = 0; i < src.length; i++, j += 4) {
      const v = src[i]
      const a = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0
      data[j] = 255
      data[j + 1] = 255
      data[j + 2] = 255
      data[j + 3] = a
    }
    this.maskCtx.putImageData(this.maskImageData, 0, 0)
  }

  setVirtualBackground(img: HTMLImageElement | null): void {
    this.virtualImg = img
  }

  setBlurRadius(px: number): void {
    this.blurRadius = Number.isFinite(px) && px >= 0 ? px : 0
  }

  setMode(mode: 'blur' | 'virtual'): void {
    this.mode = mode
  }

  setPostProcessing(cfg: PostProcessingConfig): void {
    // Only the temporal EMA is honored on the Canvas2D path. Sigmoid, erosion,
    // opening, closing all require shader passes we don't reproduce in CPU.
    const a = cfg.ema?.alpha
    this.emaAlpha =
      typeof a === 'number' && Number.isFinite(a) && a > 0 && a <= 1 ? a : 0
    if (this.emaAlpha === 0) this.emaPrevMask = null
  }

  setUpsampling(): void {}

  render(source: RenderSource): void {
    if (!source) return
    const sw = this._sourceWidth(source)
    const sh = this._sourceHeight(source)
    if (!sw || !sh) return


    // Ensure offscreen scratch canvases exist at output size.
    this._ensureScratchCanvases()
    const bg = this.bgCanvas!
    const bgCtx = this.bgCtx!
    const fg = this.fgCanvas!
    const fgCtx = this.fgCtx!

    // 1. Build the foreground (subject only) in fgCanvas: draw source full,
    //    then composite mask via destination-in to keep only the subject.
    fgCtx.globalCompositeOperation = 'source-over'
    fgCtx.clearRect(0, 0, this.outW, this.outH)
    try {
      fgCtx.drawImage(source, 0, 0, this.outW, this.outH)
    } catch {
      // Browser may throw if the source frame isn't ready yet — skip tick.
      return
    }
    fgCtx.globalCompositeOperation = 'destination-in'
    fgCtx.drawImage(this.maskCanvas, 0, 0, this.outW, this.outH)
    fgCtx.globalCompositeOperation = 'source-over'

    // 2. Build the background in bgCanvas.
    bgCtx.globalCompositeOperation = 'source-over'
    bgCtx.clearRect(0, 0, this.outW, this.outH)
    if (this.mode === 'blur') {
      // Blur the camera frame. ctx.filter is acceptable here — this is the
      // Canvas2D fallback path, explicitly the only place blur via filter is
      // allowed in this codebase.
      bgCtx.filter = this.blurRadius > 0 ? `blur(${this.blurRadius}px)` : 'none'
      try {
        bgCtx.drawImage(source, 0, 0, this.outW, this.outH)
      } catch {
        bgCtx.filter = 'none'
        return
      }
      bgCtx.filter = 'none'
    } else {
      // Virtual background: stretch the image to fill the canvas. If the image
      // isn't ready, fall back to a neutral grey so we never leak the raw
      // camera feed in the background area.
      const img = this.virtualImg
      if (img && img.complete && img.naturalWidth > 0) {
        try {
          bgCtx.drawImage(img, 0, 0, this.outW, this.outH)
        } catch {
          bgCtx.fillStyle = '#202020'
          bgCtx.fillRect(0, 0, this.outW, this.outH)
        }
      } else {
        bgCtx.fillStyle = '#202020'
        bgCtx.fillRect(0, 0, this.outW, this.outH)
      }
    }

    // 3. Composite to output: background first, then subject on top.
    this.ctx.globalCompositeOperation = 'source-over'
    this.ctx.clearRect(0, 0, this.outW, this.outH)
    this.ctx.drawImage(bg, 0, 0)
    this.ctx.drawImage(fg, 0, 0)
  }

  destroy(): void {
    this.emaPrevMask = null
    this.bgCanvas = null
    this.bgCtx = null
    this.fgCanvas = null
    this.fgCtx = null
    // The main canvas and maskCanvas are released when their owning class is
    // dropped; setting width = 0 prompts the browser to free their backing.
    if (this.maskCanvas) {
      this.maskCanvas.width = 0
      this.maskCanvas.height = 0
    }
  }

  private _allocMaskBuffers(w: number, h: number): void {
    this.procW = w
    this.procH = h
    const c = this.maskCanvas ?? document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: false })
    if (!ctx) {
      throw new Error('Canvas2dRenderer: mask canvas 2d context unavailable')
    }
    this.maskCanvas = c
    this.maskCtx = ctx
    this.maskImageData = ctx.createImageData(w, h)
  }

  private _ensureScratchCanvases(): void {
    if (
      !this.bgCanvas ||
      this.bgCanvas.width !== this.outW ||
      this.bgCanvas.height !== this.outH
    ) {
      const c = document.createElement('canvas')
      c.width = this.outW
      c.height = this.outH
      const ctx = c.getContext('2d', { alpha: false })
      if (!ctx)
        throw new Error('Canvas2dRenderer: bg canvas 2d context unavailable')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'medium'
      this.bgCanvas = c
      this.bgCtx = ctx
    }
    if (
      !this.fgCanvas ||
      this.fgCanvas.width !== this.outW ||
      this.fgCanvas.height !== this.outH
    ) {
      const c = document.createElement('canvas')
      c.width = this.outW
      c.height = this.outH
      const ctx = c.getContext('2d', { alpha: true })
      if (!ctx)
        throw new Error('Canvas2dRenderer: fg canvas 2d context unavailable')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'medium'
      this.fgCanvas = c
      this.fgCtx = ctx
    }
  }

  private _sourceWidth(s: RenderSource): number {
    return 'videoWidth' in s ? s.videoWidth : (s as ImageBitmap).width
  }

  private _sourceHeight(s: RenderSource): number {
    return 'videoHeight' in s ? s.videoHeight : (s as ImageBitmap).height
  }

}
