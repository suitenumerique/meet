/**
 * GPU mask post-processing chain (morphological opening/closing + temporal EMA).
 *
 * Called by: WebGl2Renderer.render() on every frame, using programs and
 * textures owned by WebGl2Renderer.
 *
 * Pipeline role: Refines the raw low-resolution segmenter mask before it is
 * upsampled and composited. Runs entirely at processing resolution (procW×procH)
 * using ping-pong framebuffers. The chain order is:
 *   Opening  (erosion → dilation)  — removes stray foreground specks at edges
 *   Closing  (dilation → erosion)  — fills small holes inside the mask
 *   EMA      (temporal blend)      — smooths flicker between frames
 * Returns the WebGLTexture containing the refined mask.
 */
import { PostProcessingConfig } from '..'

/**
 * Uniform locations for the mask post-processing shaders.
 * Resolved once by WebGl2Renderer._buildPrograms() and passed in at construction.
 */
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

/**
 * GPU resources needed by the mask post-processing chain.
 * Owned by WebGl2Renderer — this class borrows them (no lifecycle management).
 */
export interface MaskPostProcessorTextures {
  rawMaskTex: WebGLTexture
  maskA: WebGLTexture
  maskB: WebGLTexture
  emaTex: WebGLTexture
  fboMaskA: WebGLFramebuffer
  fboMaskB: WebGLFramebuffer
  fboEma: WebGLFramebuffer
}

/**
 * Runs the low-resolution mask post-processing chain on the GPU.
 *
 * Pipeline: Morphology (Opening / Closing) → Temporal EMA.
 *
 * Extracted verbatim from WebGl2Renderer._runPostProcessing() and
 * _applyMorphology(). No value, threshold, or GL call order has been changed.
 */
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

    // Closing (Dilation then Erosion — fills small holes inside the mask)
    if (postCfg.closing && postCfg.closing.radius > 0) {
      const r = postCfg.closing.radius
      this._applyMorphology(dstFbo, src, r, procW, procH) // Dilation
      advance()
      this._applyMorphology(dstFbo, src, -r, procW, procH) // Erosion
      advance()
    }

    // EMA
    if (postCfg.ema) {
      const alpha = postCfg.ema.alpha
      // out = alpha * src + (1 - alpha) * prev
      gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo)
      gl.useProgram(this.programs.ema)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, src)
      gl.uniform1i(this.uLoc.ema.uTex, 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.tex.emaTex)
      gl.uniform1i(this.uLoc.ema.uPrev, 1)
      gl.uniform1f(this.uLoc.ema.uAlpha, this.hasEmaState ? alpha : 1.0)
      this.drawQuad()
      advance()
      // Copy current result into emaTex for next frame
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
