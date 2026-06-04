
import { PostProcessingConfig } from '..'
import { pushMattingError } from '../errors/MattingErrorStore'
import { GpuRenderer, GpuRendererInitOpts, RenderSource } from './GpuRenderer'


export class Canvas2dRenderer implements GpuRenderer {
  readonly backend = 'canvas2d' as const

  outW = 0
  outH = 0

  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D

  private maskCanvas!: HTMLCanvasElement
  private maskCtx!: CanvasRenderingContext2D
  private maskImageData!: ImageData
  private procW = 0
  private procH = 0

  private bgCanvas: HTMLCanvasElement | null = null
  private bgCtx: CanvasRenderingContext2D | null = null
  private fgCanvas: HTMLCanvasElement | null = null
  private fgCtx: CanvasRenderingContext2D | null = null

  private mode: 'blur' | 'virtual' = 'blur'
  private blurRadius = 10
  private virtualImg: HTMLImageElement | null = null


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

    let src = mask
    if (this.emaAlpha > 0 && this.emaAlpha < 1) {
      if (this.emaPrevMask?.length === mask.length) {
        const a = this.emaAlpha
        const inv = 1 - a
        const prev = this.emaPrevMask
        for (let i = 0; i < mask.length; i++) {
          const blended = a * mask[i] + inv * prev[i]
          prev[i] = blended
        }
        src = this.emaPrevMask
      } else {
        this.emaPrevMask = new Float32Array(mask.length)
        this.emaPrevMask.set(mask)
      }
    } else {
      this.emaPrevMask = null
    }

    const data = this.maskImageData.data
    for (let i = 0, j = 0; i < src.length; i++, j += 4) {
      const v = src[i]
      const a = Math.trunc(Math.max(0, Math.min(1, v)) * 255 + 0.5)
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

    const a = cfg.ema?.alpha
    this.emaAlpha =
      typeof a === 'number' && Number.isFinite(a) && a > 0 && a <= 1 ? a : 0
    if (this.emaAlpha === 0) this.emaPrevMask = null
  }

  setUpsampling(): void {
    // Upsampling is a no-op on the Canvas2D path.
  }

  render(source: RenderSource): void {
    if (!source) return
    const sw = this._sourceWidth(source)
    const sh = this._sourceHeight(source)
    if (!sw || !sh) return


    this._ensureScratchCanvases()
    const bg = this.bgCanvas!
    const bgCtx = this.bgCtx!
    const fg = this.fgCanvas!
    const fgCtx = this.fgCtx!

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

    bgCtx.globalCompositeOperation = 'source-over'
    bgCtx.clearRect(0, 0, this.outW, this.outH)
    if (this.mode === 'blur') {

      bgCtx.filter = this.blurRadius > 0 ? `blur(${this.blurRadius}px)` : 'none'
      try {
        bgCtx.drawImage(source, 0, 0, this.outW, this.outH)
      } catch {
        bgCtx.filter = 'none'
        return
      }
      bgCtx.filter = 'none'
    } else {
      this._drawVirtualBackground(bgCtx)
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

    if (this.maskCanvas) {
      this.maskCanvas.width = 0
      this.maskCanvas.height = 0
    }
  }

  private _drawVirtualBackground(bgCtx: CanvasRenderingContext2D): void {

    const img = this.virtualImg
    if (img?.complete && img.naturalWidth > 0) {
      try {
        bgCtx.drawImage(img, 0, 0, this.outW, this.outH)
        return
      } catch {
        // Fall through to neutral grey
      }
    }
    bgCtx.fillStyle = '#202020'
    bgCtx.fillRect(0, 0, this.outW, this.outH)
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
      this.bgCanvas?.width !== this.outW ||
      this.bgCanvas?.height !== this.outH
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
      this.fgCanvas?.width !== this.outW ||
      this.fgCanvas?.height !== this.outH
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
    return 'videoWidth' in s ? s.videoWidth : s.width
  }

  private _sourceHeight(s: RenderSource): number {
    return 'videoHeight' in s ? s.videoHeight : s.height
  }

}
