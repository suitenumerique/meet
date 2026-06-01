/**
 * Segmo-style virtual background compositor for the WebGL2 render path.
 *
 * Called by: WebGl2Renderer.render() — only when mode === 'virtual' and a
 * virtual background image has been successfully uploaded.
 *
 * Pipeline role: Replaces the standard composite shader for virtual backgrounds.
 * Runs up to three GPU passes:
 *   Pass A: edge-only feather — widens the transition band near silhouettes
 *   Pass B: segmo composite  — foreground recovery + closed-form alpha matting
 *   Pass C: light wrap       — background color spill onto foreground edges
 * Optionally prepends a foreground color-cast correction (passes T1+T2) to
 * remove old-background color contamination from edge pixels.
 */

/**
 * Uniform locations for the Segmo compositing shaders.
 * Resolved once by WebGl2Renderer._buildPrograms() and passed in at construction.
 */
export interface SegmoCompositorUniforms {
  segmo: {
    uVideo: WebGLUniformLocation | null
    uBg: WebGLUniformLocation | null
    uMask: WebGLUniformLocation | null
    uOutTexel: WebGLUniformLocation | null
  }
  feather: {
    uMask: WebGLUniformLocation | null
    uTexel: WebGLUniformLocation | null
    uRadius: WebGLUniformLocation | null
  }
  lightWrap: {
    uComposite: WebGLUniformLocation | null
    uBg: WebGLUniformLocation | null
    uMask: WebGLUniformLocation | null
    uStrength: WebGLUniformLocation | null
  }
  maskedFg: {
    uVideo: WebGLUniformLocation | null
    uMask: WebGLUniformLocation | null
  }
  fgCast: {
    uVideo: WebGLUniformLocation | null
    uFgMasked: WebGLUniformLocation | null
    uBg: WebGLUniformLocation | null
    uStrength: WebGLUniformLocation | null
  }
}

/**
 * Segmo-style compositor for virtual backgrounds.
 *
 * Runs the foreground-recovery composite shader: edge-adaptive sharpening from
 * the camera gradient, closed-form alpha matting on a 13-tap cross pattern in
 * the transition zone, chroma-aware color-separation gate, and the VFX
 * decontamination equation `output = I + (B_new − B_old) * (1 − α)` to remove
 * the old background's color contribution from contaminated edge pixels.
 *
 * Extracted verbatim from WebGl2Renderer._compositeVirtualSegmo() and its
 * target-management helpers. No GL logic, state, or threshold was modified.
 */
export class SegmoCompositor {
  private segmoFeatherRadius = 3.0
  private segmoLightWrapStrength = 0.08
  private segmoForegroundTintStrength = 0.15
  private _segmoBgMipmapsValid = false

  private segmoFeatheredMaskTex: WebGLTexture | null = null
  private fboSegmoFeatheredMask: WebGLFramebuffer | null = null

  private segmoCompositeTex: WebGLTexture | null = null
  private fboSegmoComposite: WebGLFramebuffer | null = null

  private maskedFgTex: WebGLTexture | null = null
  private fboMaskedFg: WebGLFramebuffer | null = null

  private tintedVideoTex: WebGLTexture | null = null
  private fboTintedVideo: WebGLFramebuffer | null = null

  private readonly uLoc: SegmoCompositorUniforms

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly programs: {
      segmoEdgeFeather: WebGLProgram
      compositeSegmo: WebGLProgram
      lightWrap: WebGLProgram
      maskedFg: WebGLProgram
      fgColorCast: WebGLProgram
    },
    private readonly drawQuad: () => void
  ) {
    const loc = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n)
    this.uLoc = {
      segmo: {
        uVideo: loc(programs.compositeSegmo, 'uVideo'),
        uBg: loc(programs.compositeSegmo, 'uBg'),
        uMask: loc(programs.compositeSegmo, 'uMask'),
        uOutTexel: loc(programs.compositeSegmo, 'uOutTexel'),
      },
      feather: {
        uMask: loc(programs.segmoEdgeFeather, 'uMask'),
        uTexel: loc(programs.segmoEdgeFeather, 'uTexel'),
        uRadius: loc(programs.segmoEdgeFeather, 'uRadius'),
      },
      lightWrap: {
        uComposite: loc(programs.lightWrap, 'uComposite'),
        uBg: loc(programs.lightWrap, 'uBg'),
        uMask: loc(programs.lightWrap, 'uMask'),
        uStrength: loc(programs.lightWrap, 'uStrength'),
      },
      maskedFg: {
        uVideo: loc(programs.maskedFg, 'uVideo'),
        uMask: loc(programs.maskedFg, 'uMask'),
      },
      fgCast: {
        uVideo: loc(programs.fgColorCast, 'uVideo'),
        uFgMasked: loc(programs.fgColorCast, 'uFgMasked'),
        uBg: loc(programs.fgColorCast, 'uBg'),
        uStrength: loc(programs.fgColorCast, 'uStrength'),
      },
    }
  }

  invalidateOnResize(gl: WebGL2RenderingContext) {
    if (this.segmoFeatheredMaskTex) {
      gl.deleteTexture(this.segmoFeatheredMaskTex)
      this.segmoFeatheredMaskTex = null
    }
    if (this.fboSegmoFeatheredMask) {
      gl.deleteFramebuffer(this.fboSegmoFeatheredMask)
      this.fboSegmoFeatheredMask = null
    }
    if (this.segmoCompositeTex) {
      gl.deleteTexture(this.segmoCompositeTex)
      this.segmoCompositeTex = null
    }
    if (this.fboSegmoComposite) {
      gl.deleteFramebuffer(this.fboSegmoComposite)
      this.fboSegmoComposite = null
    }
    if (this.maskedFgTex) {
      gl.deleteTexture(this.maskedFgTex)
      this.maskedFgTex = null
    }
    if (this.fboMaskedFg) {
      gl.deleteFramebuffer(this.fboMaskedFg)
      this.fboMaskedFg = null
    }
    if (this.tintedVideoTex) {
      gl.deleteTexture(this.tintedVideoTex)
      this.tintedVideoTex = null
    }
    if (this.fboTintedVideo) {
      gl.deleteFramebuffer(this.fboTintedVideo)
      this.fboTintedVideo = null
    }
  }

  destroyResources(gl: WebGL2RenderingContext) {
    this.invalidateOnResize(gl)
  }

  resetMipmapState() {
    this._segmoBgMipmapsValid = false
  }

  composite(
    videoTex: WebGLTexture,
    bgTex: WebGLTexture,
    maskTex: WebGLTexture,
    virtualBgTex: WebGLTexture | null,
    virtualImgUploaded: boolean,
    outW: number,
    outH: number
  ) {
    const gl = this.gl

    // Pass A: edge-only feather (widens the transition band near silhouettes,
    // leaves interior/exterior alone). Output is R8 at output resolution.
    this._ensureSegmoFeatherTarget(outW, outH)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboSegmoFeatheredMask)
    gl.viewport(0, 0, outW, outH)
    gl.useProgram(this.programs.segmoEdgeFeather)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, maskTex)
    gl.uniform1i(this.uLoc.feather.uMask, 0)
    gl.uniform2f(this.uLoc.feather.uTexel, 1 / outW, 1 / outH)
    gl.uniform1f(this.uLoc.feather.uRadius, this.segmoFeatherRadius)
    this.drawQuad()

    // Passes T1+T2 (foreground color cast — pure GPU via mipmaps). Skipped when
    // strength <= 0; otherwise produces tintedVideoTex which feeds the composite
    // in place of videoTex. Bg mipmaps are regenerated lazily after each upload.
    const useTint = this.segmoForegroundTintStrength > 0.0
    let videoSrc: WebGLTexture = videoTex
    if (useTint) {
      // Lazy: ensure the bg texture has a mipmap chain after upload. Detects
      // upload-completed transitions via virtualImgUploaded.
      if (
        virtualImgUploaded &&
        !this._segmoBgMipmapsValid &&
        virtualBgTex
      ) {
        gl.bindTexture(gl.TEXTURE_2D, virtualBgTex)
        gl.texParameteri(
          gl.TEXTURE_2D,
          gl.TEXTURE_MIN_FILTER,
          gl.LINEAR_MIPMAP_LINEAR
        )
        gl.generateMipmap(gl.TEXTURE_2D)
        this._segmoBgMipmapsValid = true
      } else if (!virtualImgUploaded) {
        this._segmoBgMipmapsValid = false
      }

      if (this._segmoBgMipmapsValid) {
        this._ensureSegmoTintTargets(outW, outH)
        // T1: render video × foreground weight to maskedFgTex. Weight in alpha
        // lets the cast shader recover the weighted mean as rgb/a from the top
        // mip level.
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboMaskedFg)
        gl.viewport(0, 0, outW, outH)
        gl.useProgram(this.programs.maskedFg)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, videoTex)
        gl.uniform1i(this.uLoc.maskedFg.uVideo, 0)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, this.segmoFeatheredMaskTex!)
        gl.uniform1i(this.uLoc.maskedFg.uMask, 1)
        this.drawQuad()
        // Build the mip pyramid so textureLod can fetch the global mean.
        gl.bindTexture(gl.TEXTURE_2D, this.maskedFgTex!)
        gl.generateMipmap(gl.TEXTURE_2D)

        // T2: tint video toward bg's tint. Both means read from top mip via
        // textureLod inside the shader.
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboTintedVideo)
        gl.viewport(0, 0, outW, outH)
        gl.useProgram(this.programs.fgColorCast)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, videoTex)
        gl.uniform1i(this.uLoc.fgCast.uVideo, 0)
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, this.maskedFgTex!)
        gl.uniform1i(this.uLoc.fgCast.uFgMasked, 1)
        gl.activeTexture(gl.TEXTURE2)
        gl.bindTexture(gl.TEXTURE_2D, bgTex)
        gl.uniform1i(this.uLoc.fgCast.uBg, 2)
        gl.uniform1f(
          this.uLoc.fgCast.uStrength,
          this.segmoForegroundTintStrength
        )
        this.drawQuad()
        videoSrc = this.tintedVideoTex!
      }
    }

    // Pass B: segmo composite, fed by the feathered mask. When light wrap is
    // enabled we render to an intermediate texture; otherwise straight to canvas.
    const useLightWrap = this.segmoLightWrapStrength > 0.0
    if (useLightWrap) {
      this._ensureSegmoCompositeTarget(outW, outH)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboSegmoComposite)
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }
    gl.viewport(0, 0, outW, outH)
    gl.useProgram(this.programs.compositeSegmo)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, videoSrc)
    gl.uniform1i(this.uLoc.segmo.uVideo, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, bgTex)
    gl.uniform1i(this.uLoc.segmo.uBg, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.segmoFeatheredMaskTex!)
    gl.uniform1i(this.uLoc.segmo.uMask, 2)
    gl.uniform2f(this.uLoc.segmo.uOutTexel, 1 / outW, 1 / outH)
    this.drawQuad()

    if (!useLightWrap) return

    // Pass C: light wrap — mix a small amount of the background color into the
    // narrow edge band so the subject looks lit by the virtual scene.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, outW, outH)
    gl.useProgram(this.programs.lightWrap)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.segmoCompositeTex!)
    gl.uniform1i(this.uLoc.lightWrap.uComposite, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, bgTex)
    gl.uniform1i(this.uLoc.lightWrap.uBg, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.segmoFeatheredMaskTex!)
    gl.uniform1i(this.uLoc.lightWrap.uMask, 2)
    gl.uniform1f(this.uLoc.lightWrap.uStrength, this.segmoLightWrapStrength)
    this.drawQuad()
  }

  private _createFboWithTexture(
    w: number,
    h: number,
    internalFormat: number,
    format: number,
    type: number,
    filter: number = this.gl.LINEAR
  ): { tex: WebGLTexture; fbo: WebGLFramebuffer } {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(tex)
      gl.deleteFramebuffer(fbo)
      throw new Error(`FBO incomplete: 0x${status.toString(16)}`)
    }
    return { tex, fbo }
  }

  private _ensureSegmoFeatherTarget(outW: number, outH: number) {
    if (this.segmoFeatheredMaskTex && this.fboSegmoFeatheredMask) return
    const { tex, fbo } = this._createFboWithTexture(
      outW,
      outH,
      this.gl.R8,
      this.gl.RED,
      this.gl.UNSIGNED_BYTE
    )
    this.segmoFeatheredMaskTex = tex
    this.fboSegmoFeatheredMask = fbo
  }

  private _ensureSegmoCompositeTarget(outW: number, outH: number) {
    if (this.segmoCompositeTex && this.fboSegmoComposite) return
    const { tex, fbo } = this._createFboWithTexture(
      outW,
      outH,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE
    )
    this.segmoCompositeTex = tex
    this.fboSegmoComposite = fbo
  }

  private _ensureSegmoTintTargets(outW: number, outH: number) {
    if (
      this.maskedFgTex &&
      this.fboMaskedFg &&
      this.tintedVideoTex &&
      this.fboTintedVideo
    )
      return

    const { tex: mft, fbo: mff } = this._createFboWithTexture(
      outW,
      outH,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      this.gl.LINEAR_MIPMAP_LINEAR
    )
    this.maskedFgTex = mft
    this.fboMaskedFg = mff

    const { tex: tvt, fbo: tvf } = this._createFboWithTexture(
      outW,
      outH,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE
    )
    this.tintedVideoTex = tvt
    this.fboTintedVideo = tvf
  }
}