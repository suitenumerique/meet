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
const FRAGMENT_SHADER = `
  precision mediump float;
  
  uniform sampler2D backgroundTexture;
  uniform sampler2D maskTexture;
  uniform vec2 texelSize;
  uniform float blurAmount;
  
  varying vec2 vTex;
  
  // Helper function for multi-pass blur
  vec4 multiPassBlur(sampler2D image, vec2 uv, vec2 pixelSize, float strength) {
    // Use a larger sampling area for higher quality blur
    vec4 accumulator = vec4(0.0);
    float weightSum = 0.0;
    float kernel[5];
    
    // Define our approximated Gaussian weights
    kernel[0] = 0.227027;
    kernel[1] = 0.1945946;
    kernel[2] = 0.1216216;
    kernel[3] = 0.054054;
    kernel[4] = 0.016216;
    
    // First horizontal pass
    // accumulator += texture2D(image, uv) * kernel[0];
    // weightSum += kernel[0];
    
    for (int i = 0; i < 5; i++) {
      float weight = kernel[i];
      float offset = float(i) * pixelSize.x * strength;
      accumulator += texture2D(image, uv + vec2(offset, 0.0)) * weight;
      accumulator += texture2D(image, uv - vec2(offset, 0.0)) * weight;
      weightSum += weight * 2.0;
    }
    
    vec4 horizontalPass = accumulator / weightSum;
    
    // Reset for vertical pass
    // accumulator = vec4(0.0);
    // weightSum = 0.0;

    // // Second vertical pass
    // accumulator += horizontalPass * kernel[0];
    // weightSum += kernel[0];
    //
    // for (int i = 1; i < 5; i++) {
    //   float weight = kernel[i];
    //   float offset = float(i) * pixelSize.y * strength;
    //
    //   accumulator += horizontalPass * weight;
    //   weightSum += weight;
    //
    //   // Sample vertical offsets
    //   vec2 offsetCoord;
    //
    //   offsetCoord = uv + vec2(0.0, offset);
    //   accumulator += texture2D(image, offsetCoord) * weight;
    //
    //   offsetCoord = uv - vec2(0.0, offset);
    //   accumulator += texture2D(image, offsetCoord) * weight;
    //
    //   weightSum += weight * 2.0;
    // }
    
    return accumulator / weightSum;
  }
  
  // Create a smooth edge for the mask to prevent harsh transitions
  float smoothMask(float maskValue) {
    // Add a small amount of feathering to the mask edge
    float featherAmount = 0.02;
    return smoothstep(0.0, featherAmount, maskValue);
  }
  
  void main() {
    // Get mask value and INVERT IT
    // Now: 0.0 for foreground (inside mask), 1.0 for background (outside mask)
    float rawMaskValue =  texture2D(maskTexture, vTex).r;
    float maskValue = smoothMask(rawMaskValue);
    
    // Original color (inside the mask - the "subject")
    vec4 originalColor = texture2D(backgroundTexture, vTex);
    
    // Apply blur to outside of mask - stronger blur for a more dramatic effect
    vec4 blurredColor = multiPassBlur(backgroundTexture, vTex, texelSize, blurAmount * 6.0);
    
    // Mix between blurred and original based on inverted mask
    // Now where mask was 1.0 (inside), maskValue is 0.0 (keep original)
    // Where mask was 0.0 (outside), maskValue is 1.0 (apply blur)
    // gl_FragColor = mix(originalColor, blurredColor, maskValue);
    gl_FragColor = blurredColor;
  }
`

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
    const width =
      background instanceof ImageData ? background.width : background.width || 1
    const height =
      background instanceof ImageData
        ? background.height
        : background.height || 1

    gl.uniform2f(this.texelSizeUniform!, 1.0 / width, 1.0 / height)

    // Set blur amount
    gl.uniform1f(this.blurAmountUniform!, blurAmount)
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
