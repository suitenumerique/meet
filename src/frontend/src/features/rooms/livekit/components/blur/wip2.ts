/**
 * Background Blur Shader Implementation
 *
 * Implements a high-quality background blur while preserving
 * foreground based on a mask. Uses a multi-pass blur approach
 * for a smoother, more professional-looking effect.
 *
 * This implementation INVERTS the mask to blur what's outside the mask.
 */

import { MPImageShaderContext, assertExists } from './image_shader_context'
import { ImageSource } from '@mediapipe/tasks-vision'

/**
 * Two-pass blur with smooth transition between foreground and background.
 * Uses a larger kernel and multiple passes for a higher quality blur.
 *
 * This version inverts the mask interpretation - it blurs what's OUTSIDE the mask.
 */

const FRAGMENT_SHADER = `#version 300 es
  precision mediump float;
  
  uniform sampler2D backgroundTexture;
  uniform sampler2D maskTexture;
  uniform vec2 texelSize;
  uniform float blurAmount;
  
  in vec2 vTex;
  out vec4 fragColor;

  // Smoothing function for mask transitions
  vec4 maskSmoothing() {
    // Sample the mask at the current texel
    float maskValue = texture(maskTexture, vTex).r;
    
    // Apply smoothing to reduce aliasing at mask edges
    float smoothedMask = smoothstep(0.2, 0.8, maskValue);
    
    return vec4(smoothedMask);
  }
  
  // Compute Gaussian weight based on distance and blur amount
  float gaussianWeight(float x, float y, float sigma) {
    float sigmaSq = sigma * sigma;
    float distanceSq = x * x + y * y;
    
    // Gaussian function: (1/(2πσ²)) * e^(-((x²+y²)/(2σ²)))
    return exp(-distanceSq / (2.0 * sigmaSq));
  }

  void main() {
    vec4 centerColor = texture(backgroundTexture, vTex);
    
    // Apply bilateral filtering on the mask before using it
    vec4 personMask = maskSmoothing();
    
    // Dynamic 5x5 Gaussian blur
    vec4 blurredColor = vec4(0.0);
    float totalWeight = 0.0;
    
    // Compute effective sigma from blur amount (adjust as needed)
    float sigma = max(0.1, blurAmount) + 50.0;
    
    // Apply 5x5 kernel with dynamic weights
    for (int y = -10; y <= 10; y++) {
      for (int x = -10; x <= 10; x++) {
        // Calculate Gaussian weight for this offset
        float weight = gaussianWeight(float(x), float(y), sigma);
        totalWeight += weight;
        
        vec2 offset = vec2(float(x), float(y)) * texelSize;
        vec2 sampleCoord = vTex + offset;
        blurredColor += texture(backgroundTexture, sampleCoord) * weight;
      }
    }
    
    // Normalize by total weight
    blurredColor /= totalWeight;
    
    // Blend original color with blurred background based on mask
    fragColor = mix(centerColor, blurredColor, personMask.r);
  }
`;



/** A drawing util class for high-quality background blur. */
export class BackgroundBlurShaderContext extends MPImageShaderContext {
  backgroundTexture?: WebGLTexture
  maskTextureUniform?: WebGLUniformLocation
  backgroundTextureUniform?: WebGLUniformLocation
  texelSizeUniform?: WebGLUniformLocation
  blurAmountUniform?: WebGLUniformLocation

  bindAndUploadTextures(
    foregroundMask: WebGLTexture,
    background: ImageSource,
    blurAmount: number = 1.0
  ) {
    const gl = this.gl!

    // Bind foreground mask
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, foregroundMask)

    // Bind background texture
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture!)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      background
    )

    // Set texel size (for proper blur scaling)
    let width = 1;
    let height = 1;

    if (background instanceof ImageData) {
      width = background.width;
      height = background.height;
    } else if (background instanceof HTMLCanvasElement) {
      width = background.width;
      height = background.height;
    } else if (background instanceof HTMLImageElement) {
      width = background.naturalWidth;
      height = background.naturalHeight;
    } else if (background instanceof HTMLVideoElement) {
      width = background.videoWidth;
      height = background.videoHeight;
    }

    // Ensure we have valid dimensions to prevent division by zero
    width = Math.max(width, 1);
    height = Math.max(height, 1);

    gl.uniform2f(this.texelSizeUniform!, 1.0 / width, 1.0 / height)

    // Set blur amount
    if (this.blurAmountUniform) {
      gl.uniform1f(this.blurAmountUniform, blurAmount)
    }
  }

  unbindTextures() {
    const gl = this.gl!
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  protected override getFragmentShader(): string {
    return FRAGMENT_SHADER
  }

  protected override setupTextures(): void {
    const gl = this.gl!
    gl.activeTexture(gl.TEXTURE1)
    this.backgroundTexture = this.createTexture(gl, gl.LINEAR)
  }

  protected override setupShaders(): void {
    super.setupShaders()
    const gl = this.gl!

    this.backgroundTextureUniform = assertExists(
      gl.getUniformLocation(this.program!, 'backgroundTexture'),
      'Uniform location'
    )
    this.maskTextureUniform = assertExists(
      gl.getUniformLocation(this.program!, 'maskTexture'),
      'Uniform location'
    )
    this.texelSizeUniform = assertExists(
      gl.getUniformLocation(this.program!, 'texelSize'),
      'Uniform location'
    )
    this.blurAmountUniform = assertExists(
      gl.getUniformLocation(this.program!, 'blurAmount'),
      'Uniform location'
    )
  }

  protected override configureUniforms(): void {
    super.configureUniforms()
    const gl = this.gl!
    gl.uniform1i(this.maskTextureUniform!, 0)
    gl.uniform1i(this.backgroundTextureUniform!, 1)
  }

  override close(): void {
    if (this.backgroundTexture) {
      this.gl!.deleteTexture(this.backgroundTexture)
    }
    super.close()
  }
}
