import { linkProgram } from './WebGl2Renderer'

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

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
  private readonly gl: WebGL2RenderingContext
  private readonly statsW: number
  private readonly statsH: number
  private readonly outW: number
  private readonly outH: number

  private gfH!: WebGLTexture
  private gfStats1!: WebGLTexture
  private gfStats2!: WebGLTexture
  private gfStats3!: WebGLTexture
  private gfStats4!: WebGLTexture
  private gfCoeff!: WebGLTexture
  private gfCoeffMean!: WebGLTexture
  private gfOut!: WebGLTexture

  private fboH!: WebGLFramebuffer
  private fboStats1!: WebGLFramebuffer
  private fboStats2!: WebGLFramebuffer
  private fboStats3!: WebGLFramebuffer
  private fboStats4!: WebGLFramebuffer
  private fboCoeff!: WebGLFramebuffer
  private fboCoeffMean!: WebGLFramebuffer
  private fboOut!: WebGLFramebuffer

  private pHStats1!: WebGLProgram
  private pHStats2!: WebGLProgram
  private pHStats3!: WebGLProgram
  private pHStats4!: WebGLProgram
  private pBox!: WebGLProgram
  private pSolve!: WebGLProgram
  private pApply!: WebGLProgram

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
    const texelX = 1 / this.statsW
    const texelY = 1 / this.statsH

    gl.viewport(0, 0, this.statsW, this.statsH)

    const draw = () => {
      gl.bindVertexArray(vao)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const bindTex = (unit: number, tex: WebGLTexture) => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, tex)
    }

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


  private _build() {
    const gl = this.gl

    if (!gl.getExtension('EXT_color_buffer_float')) {
      throw new Error(
        'EXT_color_buffer_float not supported — guided upsampling unavailable'
      )
    }

    const makeTex = (w: number, h: number) => {
      const t = gl.createTexture()
      if (!t) {
        throw new Error('Failed to create WebGL texture')
      }
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
      const f = gl.createFramebuffer()
      if (!f) {
        throw new Error('Failed to create WebGL framebuffer')
      }
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

    this.gfH = makeTex(this.statsW, this.statsH)
    this.gfStats1 = makeTex(this.statsW, this.statsH)
    this.gfStats2 = makeTex(this.statsW, this.statsH)
    this.gfStats3 = makeTex(this.statsW, this.statsH)
    this.gfStats4 = makeTex(this.statsW, this.statsH)
    this.gfCoeff = makeTex(this.statsW, this.statsH)
    this.gfCoeffMean = makeTex(this.statsW, this.statsH)

    gl.bindTexture(gl.TEXTURE_2D, this.gfCoeffMean)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

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

    this.pHStats1 = linkProgram(gl, VS, FS_H_STATS1, 'GF program link failed')
    this.pHStats2 = linkProgram(gl, VS, FS_H_STATS2, 'GF program link failed')
    this.pHStats3 = linkProgram(gl, VS, FS_H_STATS3, 'GF program link failed')
    this.pHStats4 = linkProgram(gl, VS, FS_H_STATS4, 'GF program link failed')
    this.pBox = linkProgram(gl, VS, FS_BOX, 'GF program link failed')
    this.pSolve = linkProgram(gl, VS, FS_SOLVE, 'GF program link failed')
    this.pApply = linkProgram(gl, VS, FS_APPLY, 'GF program link failed')

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

}
