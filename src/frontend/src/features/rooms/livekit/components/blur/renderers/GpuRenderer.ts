import { PostProcessingConfig, UpsamplingConfig } from '..'

export type RenderSource = HTMLVideoElement | ImageBitmap

export interface GpuRendererInitOpts {
  processingW: number
  processingH: number
  outW: number
  outH: number
  postProcessing: PostProcessingConfig
  upsampling: UpsamplingConfig
}

export interface GpuRenderer {
  readonly backend: 'webgl2' | 'canvas2d'
  outW: number
  outH: number
  init(canvas: HTMLCanvasElement, opts: GpuRendererInitOpts): Promise<void>
  resizeProcessing(w: number, h: number): void
  resizeOutput(w: number, h: number): void
  uploadMask(mask: Float32Array, w: number, h: number): void
  setVirtualBackground(img: HTMLImageElement | null): void
  setBlurRadius(px: number): void
  setMode(mode: 'blur' | 'virtual'): void
  setPostProcessing(cfg: PostProcessingConfig): void
  setUpsampling(cfg: UpsamplingConfig): void
  render(source: RenderSource): void
  destroy(): void
}
