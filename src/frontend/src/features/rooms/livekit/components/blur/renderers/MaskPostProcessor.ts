import { PostProcessingConfig } from '..'

export interface MaskPostProcessorUniforms {
  ema: {
    uTex: WebGLUniformLocation | null
    uPrev: WebGLUniformLocation | null
    uAlpha: WebGLUniformLocation | null
  }
  copyR: { uTex: WebGLUniformLocation | null }
  morphology: {
    uTex: WebGLUniformLocation | null
    uRadius: WebGLUniformLocation | null
    uTexel: WebGLUniformLocation | null
  }
}

export interface MaskPostProcessorTextures {
  rawMaskTex: WebGLTexture
  maskA: WebGLTexture
  maskB: WebGLTexture
  emaTex: WebGLTexture
  fboMaskA: WebGLFramebuffer
  fboMaskB: WebGLFramebuffer
  fboEma: WebGLFramebuffer
}
export class MaskPostProcessor {
  private hasEmaState = false

  private readonly uLoc: MaskPostProcessorUniforms

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly programs: {
      ema: WebGLProgram
      copyR: WebGLProgram
      morphology: WebGLProgram
    },
    private readonly tex: MaskPostProcessorTextures,
    private readonly drawQuad: () => void
  ) {
    const loc = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n)
    this.uLoc = {
      ema: {
        uTex: loc(programs.ema, 'uTex'),
        uPrev: loc(programs.ema, 'uPrev'),
        uAlpha: loc(programs.ema, 'uAlpha'),
      },
      copyR: { uTex: loc(programs.copyR, 'uTex') },
      morphology: {
        uTex: loc(programs.morphology, 'uTex'),
        uRadius: loc(programs.morphology, 'uRadius'),
        uTexel: loc(programs.morphology, 'uTexel'),
      },
    }
  }

  resetEmaState() {
    this.hasEmaState = false
  }

  run(postCfg: PostProcessingConfig, procW: number, procH: number): WebGLTexture {
    const gl = this.gl
    gl.viewport(0, 0, procW, procH)
    let src = this.tex.rawMaskTex
    let dstTex = this.tex.maskA
    let dstFbo = this.tex.fboMaskA
    const swap = () => {
      // swap A/B
      if (dstTex === this.tex.maskA) {
        dstTex = this.tex.maskB
        dstFbo = this.tex.fboMaskB
      } else {
        dstTex = this.tex.maskA
        dstFbo = this.tex.fboMaskA
      }
    }
    const advance = () => {
      src = dstTex === this.tex.maskA ? this.tex.maskA : this.tex.maskB
      swap()
    }

    // Opening (Erosion then Dilation — removes small isolated specks at mask edges)
    if (postCfg.opening && postCfg.opening.radius > 0) {
      const r = postCfg.opening.radius
      this._applyMorphology(dstFbo, src, -r, procW, procH) // Erosion
      advance()
      this._applyMorphology(dstFbo, src, r, procW, procH) // Dilation
      advance()
    }

    if (postCfg.closing && postCfg.closing.radius > 0) {
      const r = postCfg.closing.radius
      this._applyMorphology(dstFbo, src, r, procW, procH) // Dilation
      advance()
      this._applyMorphology(dstFbo, src, -r, procW, procH) // Erosion
      advance()
    }

    if (postCfg.ema) {
      const alpha = postCfg.ema.alpha
      gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo)
      gl.useProgram(this.programs.ema)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, src)
      gl.uniform1i(this.uLoc.ema.uTex, 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.tex.emaTex)
      gl.uniform1i(this.uLoc.ema.uPrev, 1)
      gl.uniform1f(this.uLoc.ema.uAlpha, this.hasEmaState ? alpha : 1)
      this.drawQuad()
      advance()
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.tex.fboEma)
      gl.useProgram(this.programs.copyR)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, src)
      gl.uniform1i(this.uLoc.copyR.uTex, 0)
      this.drawQuad()
      this.hasEmaState = true
    }

    return src
  }

  private _applyMorphology(
    fbo: WebGLFramebuffer,
    src: WebGLTexture,
    radius: number,
    procW: number,
    procH: number
  ) {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.useProgram(this.programs.morphology)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, src)
    gl.uniform1i(this.uLoc.morphology.uTex, 0)
    gl.uniform1f(this.uLoc.morphology.uRadius, radius)
    gl.uniform2f(this.uLoc.morphology.uTexel, 1 / procW, 1 / procH)
    this.drawQuad()
  }
}
