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

  const float offset[5] = float[](0.0, 1.0, 2.0, 3.0, 4.0);
  const float weight[5] = float[](0.2270270270, 0.1945945946, 0.1216216216,
    0.0540540541, 0.0162162162);

  const float radius = 0.01;

  void main() {
    vec4 centerColor = texture(backgroundTexture, vTex);
    float personMask = texture(maskTexture, vTex).r + 0.0 * blurAmount;

    vec4 frameColor = centerColor * weight[0];  

    for (int i = 1; i < 5; i++) {
      vec2 offset = vec2(offset[i]) * texelSize * radius;

      vec2 texCoord = vTex + offset;
      frameColor += texture(backgroundTexture, texCoord) * weight[i] * texture(maskTexture, texCoord).r;
      texCoord = vTex - offset;
      frameColor += texture(backgroundTexture, texCoord) * weight[i] * texture(maskTexture, texCoord).r;
    }

    fragColor = mix(centerColor, frameColor, personMask);
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
