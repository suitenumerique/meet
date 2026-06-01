/**
 * GPU implementation of the fast guided filter (He & Sun, 2015) for mask
 * upsampling from processing resolution to full output resolution.
 *
 * Called by: WebGl2Renderer._upsampleMask() — lazily instantiated on the
 * first render call after init.
 *
 * Pipeline role: Sits between MaskPostProcessor and the final composite
 * shader. Upsamples the low-resolution mask (procW×procH) to full output
 * resolution (outW×outH) using the RGB video frame as a guide image so
 * fine-detail edges (hair, shoulders) are preserved rather than bilinearly
 * blurred.
 *
 * Upsamples a low-resolution mask (procW×procH) to full output resolution
 * (outW×outH) using the RGB video frame as guide.
 *
 * Speed trick: the expensive box-filtered statistics (stats1..4, solve, coeff
 * smoothing) run at LOW resolution (statsW×statsH ≈ outW/2). The final "apply"
 * pass runs at FULL resolution, sampling the LOW-res coefficient texture with
 * LINEAR filtering — GL bilinearly upsamples a,b for free — and the FULL-res
 * video as the guide. Result: ~4× less compute, edge precision preserved
 * because the final pixel-wise application still uses the full-res guide.
 *
 * Algorithm (He et al., 2013 — RGB variant):
 *   For each window W_k of radius r centred at pixel k in the LOW-res guide I=[R,G,B]:
 *     Σ_k  = RGB covariance matrix of I in W_k  + ε·I₃
 *     c_k  = [cov(R,p), cov(G,p), cov(B,p)] in W_k  (p = bilinear-upsampled mask)
 *     a_k  = Σ_k⁻¹ · c_k        (3-vector)
 *     b_k  = mean_p - a_k · mean_I
 *   Output: q(x) = mean_{k∈W_x}(a_k) · I_full(x) + mean_{k∈W_x}(b_k)   [@ full res]
 *
 * Passes:
 *   ─ stats/coeff at statsW×statsH, RGBA16F ─
 *   H/V box of (R, G, B, p)        → stats1
 *   H/V box of (R², RG, RB, G²)    → stats2
 *   H/V box of (GB, B², Rp, Gp)    → stats3
 *   H/V box of (Bp)                → stats4
 *   solve a,b from stats            → coeff
 *   H/V box of (a_r, a_g, a_b, b)  → coeffMean   (LINEAR filter)
 *   ─ apply at outW×outH, RGBA16F ─
 *   apply: q = coeffMean·I_full + b → out  (.r channel = upsampled mask)
 *
 * Requires EXT_color_buffer_float (WebGL2, widely supported).
 */

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

/** H-pass: box_H(R, G, B, p) — p bilinearly sampled from low-res mask */
const FS_H_STATS1 = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVideo;
uniform sampler2D uMask;
uniform float uTexelX;
uniform int uRadius;
out vec4 fragColor;
void main() {
  vec4 sum = vec4(0.0);
  float cnt = 0.0;
  for (int i = -uRadius; i <= uRadius; i++) {
    vec2 uv = clamp(vec2(vUv.x + float(i) * uTexelX, vUv.y), 0.0, 1.0);
    vec3 rgb = texture(uVideo, uv).rgb;
    float p  = texture(uMask,  uv).r;
    sum += vec4(rgb, p);
    cnt += 1.0;
  }
  fragColor = sum / cnt;
}`

/** H-pass: box_H(R², RG, RB, G²) */
const FS_H_STATS2 = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVideo;
uniform float uTexelX;
uniform int uRadius;
out vec4 fragColor;
void main() {
  vec4 sum = vec4(0.0);
  float cnt = 0.0;
  for (int i = -uRadius; i <= uRadius; i++) {
    vec2 uv = clamp(vec2(vUv.x + float(i) * uTexelX, vUv.y), 0.0, 1.0);
    vec3 c = texture(uVideo, uv).rgb;
    sum += vec4(c.r*c.r, c.r*c.g, c.r*c.b, c.g*c.g);
    cnt += 1.0;
  }
  fragColor = sum / cnt;
}`

/** H-pass: box_H(GB, B², Rp, Gp) */
const FS_H_STATS3 = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVideo;
uniform sampler2D uMask;
uniform float uTexelX;
uniform int uRadius;
out vec4 fragColor;
void main() {
  vec4 sum = vec4(0.0);
  float cnt = 0.0;
  for (int i = -uRadius; i <= uRadius; i++) {
    vec2 uv = clamp(vec2(vUv.x + float(i) * uTexelX, vUv.y), 0.0, 1.0);
    vec3 c = texture(uVideo, uv).rgb;
    float p = texture(uMask, uv).r;
    sum += vec4(c.g*c.b, c.b*c.b, c.r*p, c.g*p);
    cnt += 1.0;
  }
  fragColor = sum / cnt;
}`

/** H-pass: box_H(Bp) — stored in .r */
const FS_H_STATS4 = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVideo;
uniform sampler2D uMask;
uniform float uTexelX;
uniform int uRadius;
out vec4 fragColor;
void main() {
  float sum = 0.0;
  float cnt = 0.0;
  for (int i = -uRadius; i <= uRadius; i++) {
    vec2 uv = clamp(vec2(vUv.x + float(i) * uTexelX, vUv.y), 0.0, 1.0);
    float b = texture(uVideo, uv).b;
    float p = texture(uMask,  uv).r;
    sum += b * p;
    cnt += 1.0;
  }
  fragColor = vec4(sum / cnt, 0.0, 0.0, 1.0);
}`

/**
 * Generic separable box filter — used for all V passes and for the
 * coeff H pass (just set uDir to (texelX,0) or (0,texelY)).
 */
const FS_BOX = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
uniform int uRadius;
out vec4 fragColor;
void main() {
  vec4 sum = vec4(0.0);
  float cnt = 0.0;
  for (int i = -uRadius; i <= uRadius; i++) {
    vec2 uv = clamp(vUv + float(i) * uDir, 0.0, 1.0);
    sum += texture(uTex, uv);
    cnt += 1.0;
  }
  fragColor = sum / cnt;
}`

/** Solve for linear coefficients a=(a_r,a_g,a_b) and b from window stats. */
const FS_SOLVE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uStats1;
uniform sampler2D uStats2;
uniform sampler2D uStats3;
uniform sampler2D uStats4;
uniform float uEps;
out vec4 fragColor;
void main() {
  vec4 s1 = texture(uStats1, vUv);
  vec4 s2 = texture(uStats2, vUv);
  vec4 s3 = texture(uStats3, vUv);
  float boxBp = texture(uStats4, vUv).r;

  float mR = s1.r, mG = s1.g, mB = s1.b, mP = s1.a;

  float varR  = s2.r - mR*mR;
  float covRG = s2.g - mR*mG;
  float covRB = s2.b - mR*mB;
  float varG  = s2.a - mG*mG;
  float covGB = s3.r - mG*mB;
  float varB  = s3.g - mB*mB;

  float covRp = s3.b - mR*mP;
  float covGp = s3.a - mG*mP;
  float covBp = boxBp - mB*mP;

  // Column-major: mat3(col0, col1, col2)
  mat3 Sigma = mat3(
    varR  + uEps, covRG,        covRB,
    covRG,        varG  + uEps, covGB,
    covRB,        covGB,        varB + uEps
  );

  vec3 a = inverse(Sigma) * vec3(covRp, covGp, covBp);
  float b = mP - dot(a, vec3(mR, mG, mB));

  fragColor = vec4(a, b);
}`

/** Final pass: q = dot(mean_a, I) + mean_b, clamped to [0,1]. */
const FS_APPLY = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVideo;
uniform sampler2D uCoeffMean;
out vec4 fragColor;
void main() {
  vec3 I = texture(uVideo, vUv).rgb;
  vec4 c = texture(uCoeffMean, vUv);
  float q = clamp(dot(c.rgb, I) + c.a, 0.0, 1.0);
  fragColor = vec4(q, 0.0, 0.0, 1.0);
}`

export class GpuGuidedFilter {
  private gl: WebGL2RenderingContext
  // Low-res "stats" plane: every box-filter pass (the expensive part) runs here.
  private statsW: number
  private statsH: number
  // Full-res "apply" plane: only the final per-pixel apply pass renders here.
  private outW: number
  private outH: number

  // Intermediate textures (RGBA16F). All stats/coeff textures are at statsW×statsH.
  // gfOut is at outW×outH (final apply pass writes here).
  private gfH!: WebGLTexture
  private gfStats1!: WebGLTexture
  private gfStats2!: WebGLTexture
  private gfStats3!: WebGLTexture
  private gfStats4!: WebGLTexture
  private gfCoeff!: WebGLTexture
  private gfCoeffMean!: WebGLTexture
  private gfOut!: WebGLTexture

  // FBOs
  private fboH!: WebGLFramebuffer
  private fboStats1!: WebGLFramebuffer
  private fboStats2!: WebGLFramebuffer
  private fboStats3!: WebGLFramebuffer
  private fboStats4!: WebGLFramebuffer
  private fboCoeff!: WebGLFramebuffer
  private fboCoeffMean!: WebGLFramebuffer
  private fboOut!: WebGLFramebuffer

  // Programs
  private pHStats1!: WebGLProgram
  private pHStats2!: WebGLProgram
  private pHStats3!: WebGLProgram
  private pHStats4!: WebGLProgram
  private pBox!: WebGLProgram
  private pSolve!: WebGLProgram
  private pApply!: WebGLProgram

  // Cached uniform locations — resolved once in _build(), reused every frame.
  private uHStats1!: {
    uVideo: WebGLUniformLocation | null
    uMask: WebGLUniformLocation | null
    uTexelX: WebGLUniformLocation | null
    uRadius: WebGLUniformLocation | null
  }
  private uHStats2!: {
    uVideo: WebGLUniformLocation | null
    uTexelX: WebGLUniformLocation | null
    uRadius: WebGLUniformLocation | null
  }
  private uHStats3!: {
    uVideo: WebGLUniformLocation | null
    uMask: WebGLUniformLocation | null
    uTexelX: WebGLUniformLocation | null
    uRadius: WebGLUniformLocation | null
  }
  private uHStats4!: {
    uVideo: WebGLUniformLocation | null
    uMask: WebGLUniformLocation | null
    uTexelX: WebGLUniformLocation | null
    uRadius: WebGLUniformLocation | null
  }
  private uBox!: {
    uTex: WebGLUniformLocation | null
    uDir: WebGLUniformLocation | null
    uRadius: WebGLUniformLocation | null
  }
  private uSolve!: {
    uStats1: WebGLUniformLocation | null
    uStats2: WebGLUniformLocation | null
    uStats3: WebGLUniformLocation | null
    uStats4: WebGLUniformLocation | null
    uEps: WebGLUniformLocation | null
  }
  private uApply!: {
    uVideo: WebGLUniformLocation | null
    uCoeffMean: WebGLUniformLocation | null
  }

  constructor(
    gl: WebGL2RenderingContext,
    statsW: number,
    statsH: number,
    outW: number,
    outH: number
  ) {
    this.gl = gl
    this.statsW = statsW
    this.statsH = statsH
    this.outW = outW
    this.outH = outH
    this._build()
  }

  /**
   * Run fast guided filter upsampling.
   * @param videoTexLow   Low-res RGBA8 guide (statsW×statsH) — used by stats passes.
   * @param videoTexFull  Full-res RGBA8 guide (outW×outH) — used by the apply pass.
   * @param maskTex       Low-res R8 mask texture (procW×procH), LINEAR filtered.
   * @param radius        Box filter radius in LOW-res pixels (covers 2r LOW pixels = 4r FULL).
   * @param eps           Regularisation ε.
   * @param vao           The full-screen triangle VAO from the parent renderer.
   * @returns             RGBA16F texture (outW×outH) whose .r channel is the upsampled mask.
   */
  run(
    videoTexLow: WebGLTexture,
    videoTexFull: WebGLTexture,
    maskTex: WebGLTexture,
    radius: number,
    eps: number,
    vao: WebGLVertexArrayObject
  ): WebGLTexture {
    const gl = this.gl
    const r = Math.max(1, Math.round(radius))
    const texelX = 1.0 / this.statsW
    const texelY = 1.0 / this.statsH

    // All stats and coeff passes render at low resolution.
    gl.viewport(0, 0, this.statsW, this.statsH)

    const draw = () => {
      gl.bindVertexArray(vao)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const bindTex = (unit: number, tex: WebGLTexture) => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, tex)
    }

    // ── stats1: box(R, G, B, p) ──────────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboH)
    gl.useProgram(this.pHStats1)
    bindTex(0, videoTexLow)
    bindTex(1, maskTex)
    gl.uniform1i(this.uHStats1.uVideo, 0)
    gl.uniform1i(this.uHStats1.uMask, 1)
    gl.uniform1f(this.uHStats1.uTexelX, texelX)
    gl.uniform1i(this.uHStats1.uRadius, r)
    draw()

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboStats1)
    gl.useProgram(this.pBox)
    bindTex(0, this.gfH)
    gl.uniform1i(this.uBox.uTex, 0)
    gl.uniform2f(this.uBox.uDir, 0, texelY)
    gl.uniform1i(this.uBox.uRadius, r)
    draw()

    // ── stats2: box(R², RG, RB, G²) ─────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboH)
    gl.useProgram(this.pHStats2)
    bindTex(0, videoTexLow)
    gl.uniform1i(this.uHStats2.uVideo, 0)
    gl.uniform1f(this.uHStats2.uTexelX, texelX)
    gl.uniform1i(this.uHStats2.uRadius, r)
    draw()

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboStats2)
    gl.useProgram(this.pBox)
    bindTex(0, this.gfH)
    gl.uniform1i(this.uBox.uTex, 0)
    gl.uniform2f(this.uBox.uDir, 0, texelY)
    gl.uniform1i(this.uBox.uRadius, r)
    draw()

    // ── stats3: box(GB, B², Rp, Gp) ─────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboH)
    gl.useProgram(this.pHStats3)
    bindTex(0, videoTexLow)
    bindTex(1, maskTex)
    gl.uniform1i(this.uHStats3.uVideo, 0)
    gl.uniform1i(this.uHStats3.uMask, 1)
    gl.uniform1f(this.uHStats3.uTexelX, texelX)
    gl.uniform1i(this.uHStats3.uRadius, r)
    draw()

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboStats3)
    gl.useProgram(this.pBox)
    bindTex(0, this.gfH)
    gl.uniform1i(this.uBox.uTex, 0)
    gl.uniform2f(this.uBox.uDir, 0, texelY)
    gl.uniform1i(this.uBox.uRadius, r)
    draw()

    // ── stats4: box(Bp) ──────────────────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboH)
    gl.useProgram(this.pHStats4)
    bindTex(0, videoTexLow)
    bindTex(1, maskTex)
    gl.uniform1i(this.uHStats4.uVideo, 0)
    gl.uniform1i(this.uHStats4.uMask, 1)
    gl.uniform1f(this.uHStats4.uTexelX, texelX)
    gl.uniform1i(this.uHStats4.uRadius, r)
    draw()

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboStats4)
    gl.useProgram(this.pBox)
    bindTex(0, this.gfH)
    gl.uniform1i(this.uBox.uTex, 0)
    gl.uniform2f(this.uBox.uDir, 0, texelY)
    gl.uniform1i(this.uBox.uRadius, r)
    draw()

    // ── solve a, b ───────────────────────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboCoeff)
    gl.useProgram(this.pSolve)
    bindTex(0, this.gfStats1)
    bindTex(1, this.gfStats2)
    bindTex(2, this.gfStats3)
    bindTex(3, this.gfStats4)
    gl.uniform1i(this.uSolve.uStats1, 0)
    gl.uniform1i(this.uSolve.uStats2, 1)
    gl.uniform1i(this.uSolve.uStats3, 2)
    gl.uniform1i(this.uSolve.uStats4, 3)
    gl.uniform1f(this.uSolve.uEps, eps)
    draw()

    // ── box filter a, b ──────────────────────────────────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboH)
    gl.useProgram(this.pBox)
    bindTex(0, this.gfCoeff)
    gl.uniform1i(this.uBox.uTex, 0)
    gl.uniform2f(this.uBox.uDir, texelX, 0)
    gl.uniform1i(this.uBox.uRadius, r)
    draw()

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboCoeffMean)
    gl.useProgram(this.pBox)
    bindTex(0, this.gfH)
    gl.uniform1i(this.uBox.uTex, 0)
    gl.uniform2f(this.uBox.uDir, 0, texelY)
    gl.uniform1i(this.uBox.uRadius, r)
    draw()

    // ── apply q = coeffMean · I + b   (FULL-res; coeffMean is bilinearly upsampled by GL) ──
    gl.viewport(0, 0, this.outW, this.outH)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboOut)
    gl.useProgram(this.pApply)
    bindTex(0, videoTexFull)
    bindTex(1, this.gfCoeffMean)
    gl.uniform1i(this.uApply.uVideo, 0)
    gl.uniform1i(this.uApply.uCoeffMean, 1)
    draw()

    return this.gfOut
  }

  destroy() {
    const gl = this.gl
    const textures = [
      this.gfH,
      this.gfStats1,
      this.gfStats2,
      this.gfStats3,
      this.gfStats4,
      this.gfCoeff,
      this.gfCoeffMean,
      this.gfOut,
    ]
    for (const t of textures) if (t) gl.deleteTexture(t)
    const fbos = [
      this.fboH,
      this.fboStats1,
      this.fboStats2,
      this.fboStats3,
      this.fboStats4,
      this.fboCoeff,
      this.fboCoeffMean,
      this.fboOut,
    ]
    for (const f of fbos) if (f) gl.deleteFramebuffer(f)
    const programs = [
      this.pHStats1,
      this.pHStats2,
      this.pHStats3,
      this.pHStats4,
      this.pBox,
      this.pSolve,
      this.pApply,
    ]
    for (const p of programs) if (p) gl.deleteProgram(p)
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private _build() {
    const gl = this.gl

    if (!gl.getExtension('EXT_color_buffer_float')) {
      throw new Error(
        'EXT_color_buffer_float not supported — guided upsampling unavailable'
      )
    }

    const makeTex = (w: number, h: number) => {
      const t = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA16F,
        w,
        h,
        0,
        gl.RGBA,
        gl.HALF_FLOAT,
        null
      )
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
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
      const s = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
      if (s !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error(`GF FBO incomplete: 0x${s.toString(16)}`)
      }
      return f
    }

    // Stats & coeff intermediates: low-res (the expensive box-filter plane).
    this.gfH = makeTex(this.statsW, this.statsH)
    this.gfStats1 = makeTex(this.statsW, this.statsH)
    this.gfStats2 = makeTex(this.statsW, this.statsH)
    this.gfStats3 = makeTex(this.statsW, this.statsH)
    this.gfStats4 = makeTex(this.statsW, this.statsH)
    this.gfCoeff = makeTex(this.statsW, this.statsH)
    this.gfCoeffMean = makeTex(this.statsW, this.statsH)
    // gfCoeffMean is sampled at FULL-res UV by the apply pass → LINEAR makes GL
    // bilinearly upsample the (a, b) coefficients for free. This is the key
    // fast-guided-filter trick: cheap stats at low res, exact apply at full res.
    gl.bindTexture(gl.TEXTURE_2D, this.gfCoeffMean)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    // Final output: full-res. LINEAR so downstream compositor can read with
    // sub-pixel mask-warp offsets without aliasing.
    this.gfOut = makeTex(this.outW, this.outH)
    gl.bindTexture(gl.TEXTURE_2D, this.gfOut)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

    this.fboH = makeFbo(this.gfH)
    this.fboStats1 = makeFbo(this.gfStats1)
    this.fboStats2 = makeFbo(this.gfStats2)
    this.fboStats3 = makeFbo(this.gfStats3)
    this.fboStats4 = makeFbo(this.gfStats4)
    this.fboCoeff = makeFbo(this.gfCoeff)
    this.fboCoeffMean = makeFbo(this.gfCoeffMean)
    this.fboOut = makeFbo(this.gfOut)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    this.pHStats1 = this._link(VS, FS_H_STATS1)
    this.pHStats2 = this._link(VS, FS_H_STATS2)
    this.pHStats3 = this._link(VS, FS_H_STATS3)
    this.pHStats4 = this._link(VS, FS_H_STATS4)
    this.pBox = this._link(VS, FS_BOX)
    this.pSolve = this._link(VS, FS_SOLVE)
    this.pApply = this._link(VS, FS_APPLY)

    // Cache all uniform locations once — avoids per-frame string lookups
    // through the GL driver which can stall the CPU-GPU pipeline.
    const loc = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n)
    this.uHStats1 = {
      uVideo: loc(this.pHStats1, 'uVideo'),
      uMask: loc(this.pHStats1, 'uMask'),
      uTexelX: loc(this.pHStats1, 'uTexelX'),
      uRadius: loc(this.pHStats1, 'uRadius'),
    }
    this.uHStats2 = {
      uVideo: loc(this.pHStats2, 'uVideo'),
      uTexelX: loc(this.pHStats2, 'uTexelX'),
      uRadius: loc(this.pHStats2, 'uRadius'),
    }
    this.uHStats3 = {
      uVideo: loc(this.pHStats3, 'uVideo'),
      uMask: loc(this.pHStats3, 'uMask'),
      uTexelX: loc(this.pHStats3, 'uTexelX'),
      uRadius: loc(this.pHStats3, 'uRadius'),
    }
    this.uHStats4 = {
      uVideo: loc(this.pHStats4, 'uVideo'),
      uMask: loc(this.pHStats4, 'uMask'),
      uTexelX: loc(this.pHStats4, 'uTexelX'),
      uRadius: loc(this.pHStats4, 'uRadius'),
    }
    this.uBox = {
      uTex: loc(this.pBox, 'uTex'),
      uDir: loc(this.pBox, 'uDir'),
      uRadius: loc(this.pBox, 'uRadius'),
    }
    this.uSolve = {
      uStats1: loc(this.pSolve, 'uStats1'),
      uStats2: loc(this.pSolve, 'uStats2'),
      uStats3: loc(this.pSolve, 'uStats3'),
      uStats4: loc(this.pSolve, 'uStats4'),
      uEps: loc(this.pSolve, 'uEps'),
    }
    this.uApply = {
      uVideo: loc(this.pApply, 'uVideo'),
      uCoeffMean: loc(this.pApply, 'uCoeffMean'),
    }
  }

  private _compile(stage: number, src: string): WebGLShader {
    const gl = this.gl
    const sh = gl.createShader(stage)!
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) ?? ''
      gl.deleteShader(sh)
      throw new Error(`GF shader compile failed:\n${log}\n---\n${src}`)
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
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p) ?? ''
      gl.deleteProgram(p)
      throw new Error(`GF program link failed: ${log}`)
    }
    return p
  }
}
