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

export class SegmoCompositor {
  private readonly segmoFeatherRadius = 3
  private readonly segmoLightWrapStrength = 0.08
  private readonly segmoForegroundTintStrength = 0.15
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

    const useTint = this.segmoForegroundTintStrength > 0
    let videoSrc: WebGLTexture = videoTex
    if (useTint) {
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
        gl.bindTexture(gl.TEXTURE_2D, this.maskedFgTex!)
        gl.generateMipmap(gl.TEXTURE_2D)

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

    const useLightWrap = this.segmoLightWrapStrength > 0
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
    const tex = gl.createTexture()
    if (!tex) {
      throw new Error('Failed to create WebGL texture')
    }
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    const fbo = gl.createFramebuffer()
    if (!fbo) {
      gl.deleteTexture(tex)
      throw new Error('Failed to create WebGL framebuffer')
    }
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