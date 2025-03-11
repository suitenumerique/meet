import { MPMask } from '@mediapipe/tasks-vision'
import { BackgroundBlurShaderContext } from './wip2.ts'

// Type definitions
type ImageSource =
  | HTMLCanvasElement
  | HTMLImageElement
  | HTMLVideoElement
  | ImageData

export class DrawingUtils2 {
  private backgroundBlurShaderContext?: BackgroundBlurShaderContext
  private readonly contextWebGL?: WebGL2RenderingContext

  /**
   * Creates a new DrawingUtils class.
   *
   * @param gpuContext The WebGL canvas rendering context to render into. If
   *     your Task is using a GPU delegate, the context must be obtained from
   * its canvas (provided via `setOptions({ canvas: .. })`).
   */
  constructor(gpuContext: WebGL2RenderingContext)
  /**
   * Creates a new DrawingUtils class.
   *
   * @param cpuContext The 2D canvas rendering context to render into. If
   *     you are rendering GPU data you must also provide `gpuContext` to allow
   *     for data conversion.
   * @param gpuContext A WebGL canvas that is used for GPU rendering and for
   *     converting GPU to CPU data. If your Task is using a GPU delegate, the
   *     context must be obtained from  its canvas (provided via
   *     `setOptions({ canvas: .. })`).
   */
  constructor(
    cpuContext: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    gpuContext?: WebGL2RenderingContext
  )
  constructor(
    cpuOrGpuContext:
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | WebGL2RenderingContext,
    gpuContext?: WebGL2RenderingContext
  ) {
    if (
      (typeof CanvasRenderingContext2D !== 'undefined' &&
        cpuOrGpuContext instanceof CanvasRenderingContext2D) ||
      cpuOrGpuContext instanceof OffscreenCanvasRenderingContext2D
    ) {
      this.contextWebGL = gpuContext
    } else {
      // If the first condition is false, then the first argument must be a
      // WebGL2RenderingContext
      this.contextWebGL = cpuOrGpuContext as WebGL2RenderingContext
    }
  }

  private getWebGLRenderingContext(): WebGL2RenderingContext {
    if (!this.contextWebGL) {
      throw new Error(
        'GPU rendering requested but WebGL2RenderingContext not provided.'
      )
    }
    return this.contextWebGL
  }

  private getBackgroundBlurShaderContext(): BackgroundBlurShaderContext {
    if (!this.backgroundBlurShaderContext) {
      this.backgroundBlurShaderContext = new BackgroundBlurShaderContext()
    }
    return this.backgroundBlurShaderContext
  }

  /** Applies background blur effect using WebGL2. */
  private applyBackgroundBlurWebGL(
    maskTexture: WebGLTexture,
    background: ImageSource,
    blurAmount: number = 1.0
  ): void {
    const shaderContext = this.getBackgroundBlurShaderContext()
    const gl = this.getWebGLRenderingContext()

    shaderContext.run(gl, /* flipTexturesVertically= */ true, () => {
      shaderContext.bindAndUploadTextures(maskTexture, background, blurAmount)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLE_FAN, 0, 4)
      shaderContext.unbindTextures()
    })
  }

  /**
   * Applies a background blur effect using the mask to preserve the foreground.
   *
   * @export
   * @param mask A binary mask that was returned from a segmentation task (1 for foreground, 0 for background).
   * @param background The input image to blur the background of.
   * @param blurAmount Optional blur amount parameter (defaults to 1.0, higher values create stronger blur).
   */
  applyBackgroundBlur(
    mask: MPMask,
    background: ImageSource,
    blurAmount: number = 1.0
  ): void {
    this.applyBackgroundBlurWebGL(
      mask.getAsWebGLTexture(),
      background,
      blurAmount
    )
  }

  /**
   * Frees all WebGL resources held by this class.
   * @export
   */
  close(): void {
    this.backgroundBlurShaderContext?.close()
    this.backgroundBlurShaderContext = undefined
  }
}
