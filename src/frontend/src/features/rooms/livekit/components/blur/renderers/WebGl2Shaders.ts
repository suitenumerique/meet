/**
 * GLSL shader source constants for the WebGL2 matting compositor.
 *
 * Called by: WebGl2Renderer._buildPrograms() — every shader in this file is
 * compiled once at renderer initialisation.
 *
 * Pipeline role: Static data module; supplies the complete GLSL source for
 * every GPU pass in the WebGL2 path:
 *   VS                    shared full-screen triangle vertex shader
 *   FS_COPY_R             blit a single-channel texture
 *   FS_EMA                temporal exponential moving average on the mask
 *   FS_MORPHOLOGY         GPU morphology (positive radius = dilation, negative = erosion)
 *   FS_MASKED_DOWNSAMPLE  background-only 3×3 weighted downsample to half-res
 *   FS_MASK_WEIGHTED_BLUR mask-weighted separable Gaussian blur
 *   FS_COMPOSITE          standard blur / virtual background composite
 *   FS_COMPOSITE_SEGMO, FS_SEGMO_EDGE_FEATHER, FS_LIGHT_WRAP,
 *   FS_MASKED_FG, FS_FG_COLOR_CAST  — segmo virtual-background pass shaders
 */

// ─────────────────────── Vertex shader (shared by all passes) ───────────────

export const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  // Map clip-space [-1,1] to UV [0,1].
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

// ─────────────────────── Mask post-processing shaders ───────────────────────

export const FS_COPY_R = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 fragColor;
void main() {
  fragColor = texture(uTex, vUv);
}`

export const FS_EMA = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uPrev;
uniform float uAlpha; // 1.0 means "no smoothing — use current"
out vec4 fragColor;
void main() {
  float cur = texture(uTex, vUv).r;
  float prev = texture(uPrev, vUv).r;
  fragColor = vec4(uAlpha * cur + (1.0 - uAlpha) * prev, 0.0, 0.0, 1.0);
}`

export const FS_MORPHOLOGY = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uRadius; // Positive = Dilation, Negative = Erosion
uniform vec2 uTexel;
out vec4 fragColor;
void main() {
  float r = abs(uRadius);
  float val = texture(uTex, vUv).r;
  for (float i = 1.0; i <= 8.0; i++) {
    if (i > r) break;
    vec2 off = uTexel * i;
    float v1 = texture(uTex, vUv + vec2(off.x, 0.0)).r;
    float v2 = texture(uTex, vUv - vec2(off.x, 0.0)).r;
    float v3 = texture(uTex, vUv + vec2(0.0, off.y)).r;
    float v4 = texture(uTex, vUv - vec2(0.0, off.y)).r;
    if (uRadius > 0.0) {
      val = max(val, max(max(v1, v2), max(v3, v4)));
    } else {
      val = min(val, min(min(v1, v2), min(v3, v4)));
    }
  }
  fragColor = vec4(val, 0.0, 0.0, 1.0);
}`

// ─────────────────────── Background blur shaders ────────────────────────────

export const FS_MASKED_DOWNSAMPLE = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uFrame;
uniform sampler2D uMask;
uniform vec2 uSourceTexelSize; // 1/srcW, 1/srcH (full-res input)
out vec4 fragColor;
void main() {
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 sampleCoord = vUv + vec2(float(dx), float(dy)) * uSourceTexelSize;
      float fg = texture(uMask, sampleCoord).r;
      float bgWeight = 1.0 - smoothstep(0.12, 0.55, fg);
      acc += texture(uFrame, sampleCoord).rgb * bgWeight;
      wsum += bgWeight;
    }
  }
  // Fallback: if the whole 3x3 is foreground, use the center sample unweighted
  // (this region will be hidden by the foreground in the composite anyway).
  if (wsum < 0.001) {
    acc = texture(uFrame, vUv).rgb;
    wsum = 1.0;
  }
  fragColor = vec4(acc / wsum, 1.0);
}`

export const FS_MASK_WEIGHTED_BLUR = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uMask;
uniform vec2 uDirection;
uniform vec2 uTexelSize;
uniform float uRadius;
out vec4 fragColor;
void main() {
  float sigma = uRadius;
  float twoSigmaSq = 2.0 * sigma * sigma;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  const int MAX_SAMPLES = 16;
  int radius = int(min(float(MAX_SAMPLES), ceil(uRadius)));
  for (int i = -MAX_SAMPLES; i <= MAX_SAMPLES; ++i) {
    float offset = float(i);
    if (abs(offset) > float(radius)) continue;
    float gaussW = exp(-(offset * offset) / twoSigmaSq);
    vec2 sampleCoord = vUv + uDirection * uTexelSize * offset;
    float maskVal = texture(uMask, sampleCoord).r;
    // Floor at 0.001 to avoid div-by-zero; small enough to hide foreground ghosts.
    float maskW = max(1.0 - maskVal, 0.001);
    float w = gaussW * maskW;
    acc += texture(uImage, sampleCoord).rgb * w;
    wsum += w;
  }
  fragColor = vec4(acc / max(wsum, 0.001), 1.0);
}`

// ─────────────────────── Standard composite shader ──────────────────────────

export const FS_COMPOSITE = `#version 300 es
precision mediump float;
in vec2 vUv;
uniform sampler2D uVideo;     // frame-locked source (matches uMask)
uniform sampler2D uBg;
uniform sampler2D uMask;
uniform float uErosionRadius; // pixels at output resolution, 0 = disabled
uniform vec2 uOutTexel;       // vec2(1/outW, 1/outH)
out vec4 fragColor;
void main() {
  vec3 fg = texture(uVideo, vUv).rgb;
  vec3 bg = texture(uBg, vUv).rgb;
  // Erosion applied here at output resolution so that uErosionRadius is measured
  // in actual output pixels — not in the coarse processing-resolution pixels that
  // would produce large blocky artefacts after upsampling.
  // Diamond kernel (H + V in one pass): accurate enough for edge trimming.
  float m = texture(uMask, vUv).r;
  if (uErosionRadius > 0.0) {
    for (int i = 1; i <= 16; i++) {
      if (float(i) > uErosionRadius) break;
      float fi = float(i);
      m = min(m, texture(uMask, vUv + vec2(uOutTexel.x * fi, 0.0)).r);
      m = min(m, texture(uMask, vUv - vec2(uOutTexel.x * fi, 0.0)).r);
      m = min(m, texture(uMask, vUv + vec2(0.0, uOutTexel.y * fi)).r);
      m = min(m, texture(uMask, vUv - vec2(0.0, uOutTexel.y * fi)).r);
    }
  }
  // +0.035 foreground bias preserves edges that conservative segmentation models clip.
  float t = smoothstep(0.26, 0.72, clamp(m + 0.035, 0.0, 1.0));
  fragColor = vec4(mix(bg, fg, t), 1.0);
}`

// ─────────────────────── Segmo virtual-background shaders ───────────────────

// Segmo-style compositor for virtual backgrounds. Ported from
// eyalfishler/segmo (src/shaders.ts COMPOSITE_SHADER, MIT).
// Implements:
//   - Edge-adaptive sharpening using camera RGB gradient
//   - Closed-form alpha matting on a 13-tap cross pattern
//   - Chroma-aware color-separation gate (disables matting when F≈B)
//   - Foreground recovery: output = I + (B_new − B_old) * (1 − α)
// Not used by the blur path.
export const FS_COMPOSITE_SEGMO = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVideo;     // Full-res camera frame
uniform sampler2D uBg;        // Virtual background (full-res)
uniform sampler2D uMask;      // Final processed mask
uniform vec2 uOutTexel;       // (1/outW, 1/outH)
out vec4 fragColor;

// Cross-shaped sample pattern: wider reach for fg/bg color estimation (13 samples)
const vec2 mOff[13] = vec2[13](
  vec2(0.0, 0.0),
  vec2(-1.0, 0.0), vec2(1.0, 0.0), vec2(0.0, -1.0), vec2(0.0, 1.0),
  vec2(-2.0, 0.0), vec2(2.0, 0.0), vec2(0.0, -2.0), vec2(0.0, 2.0),
  vec2(-3.0, 0.0), vec2(3.0, 0.0), vec2(0.0, -3.0), vec2(0.0, 3.0)
);

void main() {
  float rawMask = texture(uMask, vUv).r;
  vec3 I = texture(uVideo, vUv).rgb;

  // Edge-adaptive sharpening: narrow the mask transition at strong camera edges
  // (shoulders), widen it at weak edges (hair).
  vec3 dx = I - texture(uVideo, vUv + vec2(uOutTexel.x, 0.0)).rgb;
  vec3 dy = I - texture(uVideo, vUv + vec2(0.0, uOutTexel.y)).rgb;
  float edgeStrength = dot(dx, dx) + dot(dy, dy);
  float sharpness = smoothstep(0.001, 0.02, edgeStrength);
  float lo = mix(0.15, 0.35, sharpness);
  float hi = mix(0.85, 0.65, sharpness);
  float mask = smoothstep(lo, hi, rawMask);

  vec3 newBg = texture(uBg, vUv).rgb;

  // Default output: standard alpha composite (used outside the transition zone).
  vec3 result = mix(newBg, I, mask);

  // Foreground recovery in transition zone [0.02, 0.98].
  // Camera pixel is contaminated: I = F_true * α + B_old * (1 − α).
  // We want: output = F_true * α + B_new * (1 − α).
  // Therefore: output = I + (B_new − B_old) * (1 − α).
  float inTransition = step(0.02, mask) * step(mask, 0.98);
  if (inTransition > 0.5) {
    vec3 fgColor = vec3(0.0);
    vec3 bgColor = vec3(0.0);
    float fgWeight = 0.0;
    float bgWeight = 0.0;
    vec2 sampleStep = uOutTexel * 4.0;

    for (int i = 0; i < 13; i++) {
      vec2 sc = vUv + mOff[i] * sampleStep;
      float m = texture(uMask, sc).r;
      vec3 col = texture(uVideo, sc).rgb;
      float dist = length(mOff[i]);
      float proximity = 1.0 / (1.0 + dist);
      float fw = smoothstep(0.6, 0.9, m) * proximity;
      float bw = smoothstep(0.4, 0.1, m) * proximity;
      fgColor += col * fw;
      fgWeight += fw;
      bgColor += col * bw;
      bgWeight += bw;
    }

    float hasBoth = step(0.01, fgWeight) * step(0.01, bgWeight);
    if (hasBoth > 0.5) {
      vec3 F = fgColor / fgWeight;
      vec3 B = bgColor / bgWeight;
      vec3 FB = F - B;
      float denom = dot(FB, FB);

      // Chroma-aware separation gate: disable matting when foreground and
      // background colors are too similar (otherwise α is numerically unstable).
      const vec3 lumW = vec3(0.299, 0.587, 0.114);
      float fbLumDiff = dot(FB, lumW);
      vec3 fbChromaDiff = FB - fbLumDiff;
      float perceptualDenom = fbLumDiff * fbLumDiff + dot(fbChromaDiff, fbChromaDiff) * 3.0;
      float colorSeparation = smoothstep(0.02, 0.08, perceptualDenom);

      float mattedAlpha = clamp(dot(I - B, FB) / max(denom, 0.01), 0.0, 1.0);

      float blendFactor = smoothstep(0.02, 0.15, rawMask)
                        * (1.0 - smoothstep(0.9, 1.0, rawMask))
                        * colorSeparation;
      float alpha = mix(mask, mattedAlpha, blendFactor * 0.8);

      vec3 recovered = I + (newBg - B) * (1.0 - alpha);
      result = mix(result, clamp(recovered, 0.0, 1.0), blendFactor);
    }
  }

  fragColor = vec4(result, 1.0);
}`

// Edge-only feather. Ported from eyalfishler/segmo (EDGE_FEATHER_SHADER, MIT).
// Detects edges (max neighbor mask diff), then blends a 5×5 gaussian-blurred
// mask value over the original only where an edge is present.
export const FS_SEGMO_EDGE_FEATHER = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uMask;
uniform vec2 uTexel;       // 1 / target dimensions (output resolution)
uniform float uRadius;     // feather radius in texels (typical 2-5)
out vec4 fragColor;

void main() {
  float center = texture(uMask, vUv).r;

  vec2 edgeStep = uTexel * 2.0;
  float maxDiff = 0.0;
  maxDiff = max(maxDiff, abs(center - texture(uMask, vUv + vec2(-edgeStep.x, -edgeStep.y)).r));
  maxDiff = max(maxDiff, abs(center - texture(uMask, vUv + vec2(0.0, -edgeStep.y)).r));
  maxDiff = max(maxDiff, abs(center - texture(uMask, vUv + vec2(edgeStep.x, -edgeStep.y)).r));
  maxDiff = max(maxDiff, abs(center - texture(uMask, vUv + vec2(-edgeStep.x, 0.0)).r));
  maxDiff = max(maxDiff, abs(center - texture(uMask, vUv + vec2(edgeStep.x, 0.0)).r));
  maxDiff = max(maxDiff, abs(center - texture(uMask, vUv + vec2(-edgeStep.x, edgeStep.y)).r));
  maxDiff = max(maxDiff, abs(center - texture(uMask, vUv + vec2(0.0, edgeStep.y)).r));
  maxDiff = max(maxDiff, abs(center - texture(uMask, vUv + vec2(edgeStep.x, edgeStep.y)).r));

  float edgeness = smoothstep(0.02, 0.15, maxDiff);

  if (edgeness < 0.01) {
    fragColor = vec4(center, 0.0, 0.0, 1.0);
    return;
  }

  // 5×5 gaussian: bDist[i] is the squared distance from center.
  const float bDist[25] = float[25](
    8.0, 5.0, 4.0, 5.0, 8.0,
    5.0, 2.0, 1.0, 2.0, 5.0,
    4.0, 1.0, 0.0, 1.0, 4.0,
    5.0, 2.0, 1.0, 2.0, 5.0,
    8.0, 5.0, 4.0, 5.0, 8.0
  );
  const vec2 bOff[25] = vec2[25](
    vec2(-2.0, -2.0), vec2(-1.0, -2.0), vec2(0.0, -2.0), vec2(1.0, -2.0), vec2(2.0, -2.0),
    vec2(-2.0, -1.0), vec2(-1.0, -1.0), vec2(0.0, -1.0), vec2(1.0, -1.0), vec2(2.0, -1.0),
    vec2(-2.0,  0.0), vec2(-1.0,  0.0), vec2(0.0,  0.0), vec2(1.0,  0.0), vec2(2.0,  0.0),
    vec2(-2.0,  1.0), vec2(-1.0,  1.0), vec2(0.0,  1.0), vec2(1.0,  1.0), vec2(2.0,  1.0),
    vec2(-2.0,  2.0), vec2(-1.0,  2.0), vec2(0.0,  2.0), vec2(1.0,  2.0), vec2(2.0,  2.0)
  );

  vec2 blurStep = uTexel * uRadius;
  float blurred = 0.0;
  float totalWeight = 0.0;
  for (int i = 0; i < 25; i++) {
    // gaussian with sigma = 1 in cell units (segmo's formula collapses to this).
    float weight = exp(-bDist[i] * 0.5);
    blurred += texture(uMask, vUv + bOff[i] * blurStep).r * weight;
    totalWeight += weight;
  }
  blurred /= totalWeight;

  float result = mix(center, blurred, edgeness);
  fragColor = vec4(result, 0.0, 0.0, 1.0);
}`

// Light wrap. Ported from eyalfishler/segmo (LIGHT_WRAP_SHADER, MIT).
// Adds subtle background spill onto foreground edge pixels so the subject
// looks lit by the virtual scene instead of pasted on top of it.
export const FS_LIGHT_WRAP = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uComposite;   // segmo composite output
uniform sampler2D uBg;          // virtual background
uniform sampler2D uMask;        // feathered mask (same as composite consumed)
uniform float uStrength;        // 0.05-0.15 typical
out vec4 fragColor;

void main() {
  vec4 comp = texture(uComposite, vUv);
  vec4 bg = texture(uBg, vUv);
  float mask = texture(uMask, vUv).r;

  // Narrow band right inside the silhouette (mask ≈ 0.5).
  float edgeMask = smoothstep(0.25, 0.45, mask) * (1.0 - smoothstep(0.55, 0.75, mask));

  fragColor = mix(comp, bg, edgeMask * uStrength);
}`

// Masked-foreground pre-pass for color cast. Writes rgb = video * weight,
// a = weight, where weight = smoothstep(0.3, 0.7, mask). Generating mipmaps
// on this target produces a top mip where rgb is the weighted sum and a is
// the weight sum; their ratio is the foreground mean color.
export const FS_MASKED_FG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVideo;
uniform sampler2D uMask;
out vec4 fragColor;
void main() {
  float w = smoothstep(0.3, 0.7, texture(uMask, vUv).r);
  vec3 v = texture(uVideo, vUv).rgb;
  fragColor = vec4(v * w, w);
}`

// Foreground color cast. Reads global means from top mips via textureLod
// (the GPU clamps the LOD argument to the deepest available level — a 1×1
// or near-1 texel that holds the average of the texture). Computes a
// per-channel correction that shifts the foreground toward the background's
// tint, clamped to a safe range to protect skin tones, and applied at the
// requested strength.
export const FS_FG_COLOR_CAST = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVideo;
uniform sampler2D uFgMasked;   // mipmapped: rgb = sum(video*w), a = sum(w)
uniform sampler2D uBg;         // mipmapped
uniform float uStrength;
out vec4 fragColor;
void main() {
  vec3 video = texture(uVideo, vUv).rgb;
  // 32.0 is well above the deepest mip level for any practical resolution;
  // the sampler clamps to the top of the pyramid.
  vec4 fgSum = textureLod(uFgMasked, vec2(0.5), 32.0);
  vec3 fgMean = fgSum.rgb / max(fgSum.a, 0.001);
  vec3 bgMean = textureLod(uBg, vec2(0.5), 32.0).rgb;

  vec3 correction = bgMean / max(fgMean, vec3(0.01));
  correction = clamp(correction, vec3(0.7), vec3(1.4));

  vec3 tinted = mix(video, video * correction, uStrength);
  fragColor = vec4(tinted, 1.0);
}`
