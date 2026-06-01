/**
 * Primary WebGL2 compositor for the background matting pipeline.
 *
 * Called by: AdvancedMattingProcessor._initRendererWithFallback() — tried
 * first; Canvas2dRenderer is used only if this throws during init.
 *
 * Pipeline role: Implements the full GPU render path per frame:
 *   uploadMask()  → raw mask uploaded to rawMaskTex
 *   render()      → MaskPostProcessor (morphology + EMA)
 *                 → GpuGuidedFilter upsampling to output resolution
 *                 → background build (blur path or virtual image)
 *                 → SegmoCompositor (virtual path) or standard composite shader
 * All blur passes are GLSL shaders — ctx.filter is never used on this path.
 */
import { PostProcessingConfig, UpsamplingConfig } from '..'
import { pushMattingError } from '../errors/MattingErrorStore'
import { GpuRenderer, GpuRendererInitOpts, RenderSource } from './GpuRenderer'
import { GpuGuidedFilter } from './GpuGuidedFilter'
import { MaskPostProcessor } from './MaskPostProcessor'
import { SegmoCompositor } from './SegmoCompositor'
import {
  VS,
  FS_COPY_R,
  FS_EMA,
  FS_MORPHOLOGY,
  FS_MASKED_DOWNSAMPLE,
  FS_MASK_WEIGHTED_BLUR,
  FS_COMPOSITE,
  FS_COMPOSITE_SEGMO,
  FS_SEGMO_EDGE_FEATHER,
  FS_LIGHT_WRAP,
  FS_MASKED_FG,
  FS_FG_COLOR_CAST,
} from './WebGl2Shaders'

/**
 * WebGL2 implementation of the matting compositor.
 *
 * Pipeline per frame (`render(videoElement)`):
 *   videoTex ← upload from <video>
 *   maskTex  ← uploaded once per new mask (uploadMask)
 *   maskRefined ← post-processing chain (morpho → ema)
 *   bgBlur ← (mode === 'blur') maskedDownsample(videoTex, mask)
 *                              → maskWeightedGaussH → maskWeightedGaussV  (half-res)
 *           (mode === 'virtual') virtualBgTex
 *   canvas  ← composite(videoTex, bgBlur, maskRefined)
 *
 * SAFARI: never uses ctx.filter. Every blur is a shader.
 * NOTE: Guided filter is NOT implemented in shaders here yet — the orchestrator
 *       falls back to the CPU implementation when guided filter is enabled.
 */
export class WebGl2Renderer implements GpuRenderer {
  readonly backend = 'webgl2'

  private gl!: WebGL2RenderingContext
  outW = 0
  outH = 0
  private procW = 0
  private procH = 0
  private postCfg: PostProcessingConfig = {}
  private upsamplingCfg: UpsamplingConfig = {}
  private gf: GpuGuidedFilter | null = null
  private mode: 'blur' | 'virtual' = 'blur'
  private blurRadius = 10

  private maskPostProcessor!: MaskPostProcessor
  private segmoCompositor!: SegmoCompositor

  private vao!: WebGLVertexArrayObject
  private quadBuffer!: WebGLBuffer

  // programs
  private pEma!: WebGLProgram
  private pCopyR!: WebGLProgram
  private pMaskedDownsample!: WebGLProgram
  private pMaskWeightedBlur!: WebGLProgram
  private pMorphology!: WebGLProgram
  private pComposite!: WebGLProgram
  // Segmo-style virtual-background compositor (foreground recovery + edge-adaptive
  // sharpening + closed-form alpha matting). Used ONLY when mode === 'virtual' and
  // a virtual background image is uploaded. Never runs in the blur path.
  private pCompositeSegmo!: WebGLProgram
  private pSegmoEdgeFeather!: WebGLProgram
  private pLightWrap!: WebGLProgram
  private pMaskedFg!: WebGLProgram
  private pFgColorCast!: WebGLProgram

  // textures
  private videoTex!: WebGLTexture
  private rawMaskTex!: WebGLTexture // R8 at proc res — uploaded from segmenter
  private maskA!: WebGLTexture // R8 ping
  private maskB!: WebGLTexture // R8 pong
  private emaTex!: WebGLTexture // R8, persistent across frames
  private bgDownTex!: WebGLTexture // RGBA half-res masked downsample
  private bgBlurPingTex!: WebGLTexture // RGBA half-res after H blur
  private bgBlurPongTex!: WebGLTexture // RGBA half-res after V blur
  private halfVideoTex: WebGLTexture | null = null // RGBA half-res video guide for GF
  private virtualBgTex: WebGLTexture | null = null

  // FBOs
  private fboMaskA!: WebGLFramebuffer
  private fboMaskB!: WebGLFramebuffer
  private fboEma!: WebGLFramebuffer
  private fboBgDown!: WebGLFramebuffer
  private fboBgBlurPing!: WebGLFramebuffer
  private fboBgBlurPong!: WebGLFramebuffer
  private fboHalfVideo: WebGLFramebuffer | null = null

  private halfW = 0
  private halfH = 0
  private virtualImgPending: HTMLImageElement | null = null
  private virtualImgUploaded = false

  // Reusable CPU buffer for Float32→Uint8 mask conversion (avoids per-frame allocation).
  private u8MaskBuffer?: Uint8Array

  // Cached uniform locations — resolved once in _buildPrograms(), reused every frame.
  // Eliminates ~43 string-lookup driver calls per frame.
  private uLoc!: {
    copyR: {
      uTex: WebGLUniformLocation | null
    }
    maskedDown: {
      uFrame: WebGLUniformLocation | null
      uMask: WebGLUniformLocation | null
      uSourceTexelSize: WebGLUniformLocation | null
    }
    blur: {
      uImage: WebGLUniformLocation | null
      uMask: WebGLUniformLocation | null
      uDirection: WebGLUniformLocation | null
      uTexelSize: WebGLUniformLocation | null
      uRadius: WebGLUniformLocation | null
    }
    composite: {
      uVideo: WebGLUniformLocation | null
      uBg: WebGLUniformLocation | null
      uMask: WebGLUniformLocation | null
      uErosionRadius: WebGLUniformLocation | null
      uOutTexel: WebGLUniformLocation | null
    }
  }

  async init(canvas: HTMLCanvasElement, opts: GpuRendererInitOpts) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: true,
      // Must be true for captureStream() to read WebGL output correctly on Safari.
      // With false, the browser clears the buffer before captureStream can grab it.
      preserveDrawingBuffer: true,
      // Important for Safari: ensure the GPU is allowed.
      powerPreference: 'high-performance',
    })
    if (!gl) {
      pushMattingError({
        code: 'WEBGL2_INIT_FAILED',
        level: 'error',
        detail: 'getContext("webgl2") returned null',
      })
      throw new Error('WebGL2 unavailable')
    }
    this.gl = gl
    this.outW = opts.outW
    this.outH = opts.outH
    this.procW = opts.processingW
    this.procH = opts.processingH
    this.postCfg = opts.postProcessing
    this.upsamplingCfg = opts.upsampling
    this.halfW = Math.max(2, Math.floor(this.outW / 2))
    this.halfH = Math.max(2, Math.floor(this.outH / 2))

    canvas.width = this.outW
    canvas.height = this.outH
    gl.viewport(0, 0, this.outW, this.outH)
    // HTML element uploads (video, virtual bg image) get Y-flipped on upload so
    // that texture coord (0,0) corresponds to the BOTTOM-LEFT pixel of the source
    // image — matching WebGL's bottom-up coord system. Mask typed-array uploads
    // are not affected (UNPACK_FLIP_Y_WEBGL does not apply); we compensate by
    // sampling the mask with `(x, 1-y)` in the composite shader.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

    try {
      this._buildPrograms()
      this._buildQuad()
      this._buildTexturesAndFBOs()

      this.maskPostProcessor = new MaskPostProcessor(
        this.gl,
        {
          ema: this.pEma,
          copyR: this.pCopyR,
          morphology: this.pMorphology,
        },
        {
          rawMaskTex: this.rawMaskTex,
          maskA: this.maskA,
          maskB: this.maskB,
          emaTex: this.emaTex,
          fboMaskA: this.fboMaskA,
          fboMaskB: this.fboMaskB,
          fboEma: this.fboEma,
        },
        () => this._drawQuad()
      )

      this.segmoCompositor = new SegmoCompositor(
        this.gl,
        {
          segmoEdgeFeather: this.pSegmoEdgeFeather,
          compositeSegmo: this.pCompositeSegmo,
          lightWrap: this.pLightWrap,
          maskedFg: this.pMaskedFg,
          fgColorCast: this.pFgColorCast,
        },
        () => this._drawQuad()
      )
    } catch (e) {
      pushMattingError({
        code: 'POSTPROCESS_SHADER_COMPILE_FAILED',
        level: 'error',
        detail: e instanceof Error ? e.message : String(e),
      })
      throw e
    }
  }

  resizeProcessing(w: number, h: number) {
    if (w === this.procW && h === this.procH) return
    this.procW = w
    this.procH = h
    const gl = this.gl
    // Reallocate proc-sized textures (rawMask, maskA, maskB, ema)
    for (const tex of [this.rawMaskTex, this.maskA, this.maskB, this.emaTex]) {
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8,
        w,
        h,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        null
      )
    }
    this.maskPostProcessor?.resetEmaState()
  }

  resizeOutput(w: number, h: number) {
    if (w === this.outW && h === this.outH) return
    this.outW = w
    this.outH = h
    this.halfW = Math.max(2, Math.floor(w / 2))
    this.halfH = Math.max(2, Math.floor(h / 2))

    const gl = this.gl
    if (!gl) return

    // 1. Reallocate videoTex at new size
    if (this.videoTex) {
      gl.bindTexture(gl.TEXTURE_2D, this.videoTex)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        w,
        h,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      )
    }

    // 2. Reallocate half-res textures
    if (this.bgDownTex) {
      gl.bindTexture(gl.TEXTURE_2D, this.bgDownTex)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.halfW,
        this.halfH,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      )
    }
    if (this.bgBlurPingTex) {
      gl.bindTexture(gl.TEXTURE_2D, this.bgBlurPingTex)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.halfW,
        this.halfH,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      )
    }
    if (this.bgBlurPongTex) {
      gl.bindTexture(gl.TEXTURE_2D, this.bgBlurPongTex)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.halfW,
        this.halfH,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      )
    }
    if (this.halfVideoTex) {
      gl.bindTexture(gl.TEXTURE_2D, this.halfVideoTex)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.halfW,
        this.halfH,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      )
    }

    // 3. Clear lazily-allocated Segmo textures so they get recreated at the new size
    this.segmoCompositor?.invalidateOnResize(gl)

    // 4. Destroy Guided Filter so it gets recreated at the new size
    if (this.gf) {
      this.gf.destroy()
      this.gf = null
    }

    // 5. Update canvas dimensions
    const canvas = gl.canvas as HTMLCanvasElement
    if (canvas) {
      canvas.width = w
      canvas.height = h
    }
  }

  uploadMask(mask: Float32Array, w: number, h: number) {
    if (w !== this.procW || h !== this.procH) {
      this.resizeProcessing(w, h)
    }
    // Convert Float32 [0,1] → Uint8, reusing a pre-allocated buffer.
    const len = mask.length
    if (!this.u8MaskBuffer || this.u8MaskBuffer.length !== len) {
      this.u8MaskBuffer = new Uint8Array(len)
    }
    const u8 = this.u8MaskBuffer
    for (let i = 0; i < len; i++) {
      const v = mask[i]
      u8[i] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0
    }
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.rawMaskTex)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED, gl.UNSIGNED_BYTE, u8)
  }

  setVirtualBackground(img: HTMLImageElement | null) {
    if (img === null) {
      this.virtualImgPending = null
      this.virtualImgUploaded = false
      this.segmoCompositor?.resetMipmapState()
      return
    }
    this.virtualImgPending = img
    this.virtualImgUploaded = false
    this.segmoCompositor?.resetMipmapState()
  }

  setBlurRadius(px: number) {
    this.blurRadius = px
  }

  setMode(mode: 'blur' | 'virtual') {
    this.mode = mode
  }

  setPostProcessing(cfg: PostProcessingConfig) {
    this.postCfg = cfg
    this.maskPostProcessor?.resetEmaState()
  }

  setUpsampling(cfg: UpsamplingConfig) {
    this.upsamplingCfg = cfg
  }

  render(source: RenderSource) {
    if (!source) return
    const isVideo = 'videoWidth' in source
    const sw = isVideo ? (source as HTMLVideoElement).videoWidth : (source as ImageBitmap).width
    if (!sw) return
    const gl = this.gl

    // 1. Upload current source frame to videoTex (full output size).
    // The shader assumes texture origin = bottom-left. For HTMLVideoElement
    // we let the global UNPACK_FLIP_Y_WEBGL=true do the flip. For
    // ImageBitmap, the bitmap is pre-flipped at creation (imageOrientation
    // 'flipY') because UNPACK_FLIP_Y_WEBGL is unreliable for bitmaps across
    // browsers — so we explicitly disable the GL flip for this upload, then
    // restore it afterwards to preserve global state used by other uploads.
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex)
    if (!isVideo) gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    try {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source
      )
    } catch (e) {
      if (!isVideo) gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      // Some browsers throw if the video frame isn't ready yet — skip this tick.
      void e
      return
    }
    if (!isVideo) gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

    // 2. Run post-processing chain on the mask at processing resolution.
    const procMaskTex = this.maskPostProcessor.run(this.postCfg, this.procW, this.procH)

    // 3. Upsample mask to full output resolution (guided filter).
    const finalMaskTex = this._upsampleMask(procMaskTex)

    // 4. Build background (blurred camera or virtual image).
    const bgTex = this._buildBackground(finalMaskTex)

    // 5. Composite — segmo-style path is taken ONLY for virtual mode with an
    //    uploaded virtual background. The blur path (and the virtual-no-image
    //    fallback, which currently returns the blurred camera) falls through to
    //    the original composite below, unchanged.
    if (
      this.mode === 'virtual' &&
      this.virtualImgUploaded &&
      this.virtualBgTex !== null &&
      bgTex === this.virtualBgTex
    ) {
      this.segmoCompositor.composite(
        this.videoTex,
        bgTex,
        finalMaskTex,
        this.virtualBgTex,
        this.virtualImgUploaded,
        this.outW,
        this.outH
      )
      gl.flush()
      return
    }

    // 5. Composite to the canvas.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.outW, this.outH)
    gl.useProgram(this.pComposite)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex)
    gl.uniform1i(this.uLoc.composite.uVideo, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, bgTex)
    gl.uniform1i(this.uLoc.composite.uBg, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, finalMaskTex)
    gl.uniform1i(this.uLoc.composite.uMask, 2)
    gl.uniform1f(
      this.uLoc.composite.uErosionRadius,
      this.postCfg.erosion?.pixels ?? 0
    )
    gl.uniform2f(this.uLoc.composite.uOutTexel, 1 / this.outW, 1 / this.outH)
    this._drawQuad()

    gl.flush()
  }

  private _upsampleMask(procMaskTex: WebGLTexture): WebGLTexture {
    if (!this.gf) {
      try {
        // Fast guided filter:
        //  - stats/coeff passes at halfW×halfH (the heavy work, 4× fewer pixels)
        //  - final apply pass at outW×outH (uses full-res guide → preserves edge precision)
        this.gf = new GpuGuidedFilter(
          this.gl,
          this.halfW,
          this.halfH,
          this.outW,
          this.outH
        )
      } catch (e) {
        pushMattingError({
          code: 'POSTPROCESS_SHADER_COMPILE_FAILED',
          level: 'warn',
          detail: e instanceof Error ? e.message : String(e),
        })
        this.upsamplingCfg = {}
        return procMaskTex
      }
    }
    const gl = this.gl
    // Blit videoTex → halfVideoTex (1 draw call; GL bilinear handles the 2× downsample).
    // The low-res guide is used by the GF's stats passes; the apply pass still
    // samples the full-res videoTex so fine details (hair, edges) survive.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboHalfVideo)
    gl.viewport(0, 0, this.halfW, this.halfH)
    gl.useProgram(this.pCopyR)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex)
    gl.uniform1i(this.uLoc.copyR.uTex, 0)
    this._drawQuad()

    const radius = this.upsamplingCfg.radius ?? 8
    const eps = this.upsamplingCfg.eps ?? 0.01
    const result = this.gf.run(
      this.halfVideoTex!,
      this.videoTex,
      procMaskTex,
      radius,
      eps,
      this.vao
    )
    gl.viewport(0, 0, this.outW, this.outH)
    return result
  }

  destroy() {
    if (!this.gl) return
    this.gf?.destroy()
    this.gf = null
    const gl = this.gl
    const tex = [
      this.videoTex,
      this.rawMaskTex,
      this.maskA,
      this.maskB,
      this.emaTex,
      this.bgDownTex,
      this.bgBlurPingTex,
      this.bgBlurPongTex,
      this.halfVideoTex,
      this.virtualBgTex,
    ]
    for (const t of tex) if (t) gl.deleteTexture(t)
    const fbo = [
      this.fboMaskA,
      this.fboMaskB,
      this.fboEma,
      this.fboBgDown,
      this.fboBgBlurPing,
      this.fboBgBlurPong,
      this.fboHalfVideo,
    ]
    for (const f of fbo) if (f) gl.deleteFramebuffer(f)
    this.segmoCompositor?.destroyResources(gl)
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer)
    if (this.vao) gl.deleteVertexArray(this.vao)
    const programs = [
      this.pEma,
      this.pCopyR,
      this.pMaskedDownsample,
      this.pMaskWeightedBlur,
      this.pMorphology,
      this.pComposite,
      this.pCompositeSegmo,
      this.pSegmoEdgeFeather,
      this.pLightWrap,
      this.pMaskedFg,
      this.pFgColorCast,
    ]
    for (const p of programs) if (p) gl.deleteProgram(p)
  }

  // ─────────────────────────────── internals ───────────────────────────────

  private _buildBackground(maskTex: WebGLTexture): WebGLTexture {
    const gl = this.gl

    if (this.mode === 'virtual') {
      // Lazy upload virtual bg image when ready.
      if (this.virtualImgPending && !this.virtualImgUploaded) {
        const img = this.virtualImgPending
        if (img.complete && img.naturalWidth > 0) {
          if (!this.virtualBgTex) {
            this.virtualBgTex = gl.createTexture()!
          }
          gl.bindTexture(gl.TEXTURE_2D, this.virtualBgTex)
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            img
          )
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
          this.virtualImgUploaded = true
        }
      }
      if (this.virtualBgTex && this.virtualImgUploaded) {
        return this.virtualBgTex
      }
      // Fallback to blur if image not ready.
    }

    // Blur path: masked downsample → mask-weighted gaussian H → V on half-res buffers.
    const radius = Math.max(1, this.blurRadius / 2)
    gl.viewport(0, 0, this.halfW, this.halfH)

    // Stage 1: masked downsample — 3x3 weighted average sampling the FULL-res
    // source, normalised by accumulated bgWeight so transition-zone pixels
    // don't darken the result (this is what causes the halo if omitted).
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBgDown)
    gl.useProgram(this.pMaskedDownsample)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex)
    gl.uniform1i(this.uLoc.maskedDown.uFrame, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, maskTex)
    gl.uniform1i(this.uLoc.maskedDown.uMask, 1)
    gl.uniform2f(
      this.uLoc.maskedDown.uSourceTexelSize,
      1.0 / this.outW,
      1.0 / this.outH
    )
    this._drawQuad()

    // Stage 2: horizontal mask-weighted gaussian.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBgBlurPing)
    gl.useProgram(this.pMaskWeightedBlur)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.bgDownTex)
    gl.uniform1i(this.uLoc.blur.uImage, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, maskTex)
    gl.uniform1i(this.uLoc.blur.uMask, 1)
    gl.uniform2f(this.uLoc.blur.uDirection, 1.0, 0.0)
    gl.uniform2f(this.uLoc.blur.uTexelSize, 1.0 / this.halfW, 1.0 / this.halfH)
    gl.uniform1f(this.uLoc.blur.uRadius, radius)
    this._drawQuad()

    // Stage 3: vertical mask-weighted gaussian.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboBgBlurPong)
    gl.useProgram(this.pMaskWeightedBlur)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.bgBlurPingTex)
    gl.uniform1i(this.uLoc.blur.uImage, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, maskTex)
    gl.uniform1i(this.uLoc.blur.uMask, 1)
    gl.uniform2f(this.uLoc.blur.uDirection, 0.0, 1.0)
    gl.uniform2f(this.uLoc.blur.uTexelSize, 1.0 / this.halfW, 1.0 / this.halfH)
    gl.uniform1f(this.uLoc.blur.uRadius, radius)
    this._drawQuad()

    return this.bgBlurPongTex
  }

  private _drawQuad() {
    const gl = this.gl
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  private _buildQuad() {
    const gl = this.gl
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    this.quadBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
    // Full-screen triangle covering [-1,1]² with UVs in [0,1]² (Y flipped to
    // sample non-mirrored video).
    // Vertex shader expects only position; it computes UV from gl_Position.
    const verts = new Float32Array([-1, -1, 3, -1, -1, 3])
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)
  }

  private _buildTexturesAndFBOs() {
    const gl = this.gl

    const makeTex = (
      w: number,
      h: number,
      internal: number,
      format: number,
      type: number,
      filter: number = gl.LINEAR
    ) => {
      const t = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      return t
    }
    const makeFbo = (tex: WebGLTexture) => {
      const f = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, f)
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        tex,
        0
      )
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error(`FBO incomplete: 0x${status.toString(16)}`)
      }
      return f
    }

    this.videoTex = makeTex(
      this.outW,
      this.outH,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE
    )
    // Mask textures at processing res
    this.rawMaskTex = makeTex(
      this.procW,
      this.procH,
      gl.R8,
      gl.RED,
      gl.UNSIGNED_BYTE
    )
    this.maskA = makeTex(
      this.procW,
      this.procH,
      gl.R8,
      gl.RED,
      gl.UNSIGNED_BYTE
    )
    this.maskB = makeTex(
      this.procW,
      this.procH,
      gl.R8,
      gl.RED,
      gl.UNSIGNED_BYTE
    )
    this.emaTex = makeTex(
      this.procW,
      this.procH,
      gl.R8,
      gl.RED,
      gl.UNSIGNED_BYTE
    )
    this.fboMaskA = makeFbo(this.maskA)
    this.fboMaskB = makeFbo(this.maskB)
    this.fboEma = makeFbo(this.emaTex)

    // BG half-res buffers (RGBA8)
    this.bgDownTex = makeTex(
      this.halfW,
      this.halfH,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE
    )
    this.bgBlurPingTex = makeTex(
      this.halfW,
      this.halfH,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE
    )
    this.bgBlurPongTex = makeTex(
      this.halfW,
      this.halfH,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE
    )
    this.fboBgDown = makeFbo(this.bgDownTex)
    this.fboBgBlurPing = makeFbo(this.bgBlurPingTex)
    this.fboBgBlurPong = makeFbo(this.bgBlurPongTex)

    this.halfVideoTex = makeTex(
      this.halfW,
      this.halfH,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE
    )
    this.fboHalfVideo = makeFbo(this.halfVideoTex)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private _compile(stage: number, src: string): WebGLShader {
    const gl = this.gl
    const sh = gl.createShader(stage)!
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) ?? '<no log>'
      gl.deleteShader(sh)
      throw new Error(`Shader compile failed: ${log}\nSrc:\n${src}`)
    }
    return sh
  }

  private _link(vsSrc: string, fsSrc: string): WebGLProgram {
    const gl = this.gl
    const vs = this._compile(gl.VERTEX_SHADER, vsSrc)
    const fs = this._compile(gl.FRAGMENT_SHADER, fsSrc)
    const p = gl.createProgram()!
    gl.attachShader(p, vs)
    gl.attachShader(p, fs)
    gl.bindAttribLocation(p, 0, 'aPos')
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p) ?? '<no log>'
      gl.deleteProgram(p)
      throw new Error(`Program link failed: ${log}`)
    }
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    return p
  }

  private _buildPrograms() {
    this.pEma = this._link(VS, FS_EMA)
    this.pCopyR = this._link(VS, FS_COPY_R)
    this.pMaskedDownsample = this._link(VS, FS_MASKED_DOWNSAMPLE)
    this.pMaskWeightedBlur = this._link(VS, FS_MASK_WEIGHTED_BLUR)
    this.pMorphology = this._link(VS, FS_MORPHOLOGY)
    this.pComposite = this._link(VS, FS_COMPOSITE)
    this.pCompositeSegmo = this._link(VS, FS_COMPOSITE_SEGMO)
    this.pSegmoEdgeFeather = this._link(VS, FS_SEGMO_EDGE_FEATHER)
    this.pLightWrap = this._link(VS, FS_LIGHT_WRAP)
    this.pMaskedFg = this._link(VS, FS_MASKED_FG)
    this.pFgColorCast = this._link(VS, FS_FG_COLOR_CAST)

    // Cache all uniform locations once — avoids per-frame string lookups
    // through the GL driver which can stall the CPU-GPU pipeline.
    const loc = (p: WebGLProgram, n: string) => this.gl.getUniformLocation(p, n)
    this.uLoc = {
      copyR: {
        uTex: loc(this.pCopyR, 'uTex'),
      },
      maskedDown: {
        uFrame: loc(this.pMaskedDownsample, 'uFrame'),
        uMask: loc(this.pMaskedDownsample, 'uMask'),
        uSourceTexelSize: loc(this.pMaskedDownsample, 'uSourceTexelSize'),
      },
      blur: {
        uImage: loc(this.pMaskWeightedBlur, 'uImage'),
        uMask: loc(this.pMaskWeightedBlur, 'uMask'),
        uDirection: loc(this.pMaskWeightedBlur, 'uDirection'),
        uTexelSize: loc(this.pMaskWeightedBlur, 'uTexelSize'),
        uRadius: loc(this.pMaskWeightedBlur, 'uRadius'),
      },
      composite: {
        uVideo: loc(this.pComposite, 'uVideo'),
        uBg: loc(this.pComposite, 'uBg'),
        uMask: loc(this.pComposite, 'uMask'),
        uErosionRadius: loc(this.pComposite, 'uErosionRadius'),
        uOutTexel: loc(this.pComposite, 'uOutTexel'),
      },
    }
  }
}
