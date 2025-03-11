import { MPMask } from '@mediapipe/tasks-vision'
import { CategoryMaskShaderContext } from './wip'

// Type definitions
type RGBAColor = [number, number, number, number]
type ImageSource =
  | HTMLCanvasElement
  | HTMLImageElement
  | HTMLVideoElement
  | ImageData

type CategoryToColorMap = Map<number, RGBAColor> | RGBAColor[]

export class DrawingUtils {
  private categoryMaskShaderContext?: CategoryMaskShaderContext
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
    cpuOrGpuGontext:
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | WebGL2RenderingContext,
    gpuContext?: WebGL2RenderingContext
  ) {
    if (
      (typeof CanvasRenderingContext2D !== 'undefined' &&
        cpuOrGpuGontext instanceof CanvasRenderingContext2D) ||
      cpuOrGpuGontext instanceof OffscreenCanvasRenderingContext2D
    ) {
      // this.context2d = cpuOrGpuGontext
      this.contextWebGL = gpuContext
    } else {
      // If the first `if` statement is false, then the first argument must be a
      // WebGL2RenderingContext, since CanvasRenderingContext2D can't be passed
      // as the first argument. However, typescript isn't smart enough to infer
      // this so we cast.
      this.contextWebGL = cpuOrGpuGontext as WebGL2RenderingContext
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

  private getCategoryMaskShaderContext(): CategoryMaskShaderContext {
    if (!this.categoryMaskShaderContext) {
      this.categoryMaskShaderContext = new CategoryMaskShaderContext()
    }
    return this.categoryMaskShaderContext
  }

  /** Draws a category mask on a WebGL2RenderingContext2D. */
  private drawCategoryMaskWebGL(
    categoryTexture: WebGLTexture,
    background: RGBAColor | ImageSource,
    categoryToColorMap: Map<number, RGBAColor> | RGBAColor[]
  ): void {
    const shaderContext = this.getCategoryMaskShaderContext()
    const gl = this.getWebGLRenderingContext()

    const backgroundImage = Array.isArray(background)
      ? new ImageData(new Uint8ClampedArray(background), 1, 1)
      : background

    shaderContext.run(gl, /* flipTexturesVertically= */ true, () => {
      shaderContext.bindAndUploadTextures(
        categoryTexture,
        backgroundImage,
        categoryToColorMap
      )
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLE_FAN, 0, 4)
      shaderContext.unbindTextures()
    })
  }

  /**
   * Draws a category mask using the provided category-to-color mapping.
   *
   * @export
   * @param mask A category mask that was returned from a segmentation task.
   * @param categoryToColorMap A map that maps category indices to RGBA
   *     values. You must specify a map entry for each category.
   * @param background A color or image to use as the background. Defaults to
   *     black.
   */
  drawCategoryMask(
    mask: MPMask,
    categoryToColorMap: Map<number, RGBAColor>,
    background?: RGBAColor | ImageSource
  ): void
  /**
   * Draws a category mask using the provided color array.
   *
   * @export
   * @param mask A category mask that was returned from a segmentation task.
   * @param categoryToColorMap An array that maps indices to RGBA values. The
   *     array's indices must correspond to the category indices of the model
   *     and an entry must be provided for each category.
   * @param background A color or image to use as the background. Defaults to
   *     black.
   */
  drawCategoryMask(
    mask: MPMask,
    categoryToColorMap: RGBAColor[],
    background?: RGBAColor | ImageSource
  ): void
  /** @export */
  drawCategoryMask(
    mask: MPMask,
    categoryToColorMap: CategoryToColorMap,
    background: RGBAColor | ImageSource = [0, 0, 0, 255]
  ): void {
    this.drawCategoryMaskWebGL(
      mask.getAsWebGLTexture(),
      background,
      categoryToColorMap
    )
  }

  /**
   * Frees all WebGL resources held by this class.
   * @export
   */
  close(): void {
    this.categoryMaskShaderContext?.close()
    this.categoryMaskShaderContext = undefined
  }
}
