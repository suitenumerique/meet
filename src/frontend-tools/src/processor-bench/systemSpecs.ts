import { SUPPORTS_LONG_TASKS, SUPPORTS_RVFC } from './collectors'

/**
 * Machine description captured alongside a report, so a pasted result says
 * which machine produced it. Everything here is best-effort: browsers vary
 * in what they expose, and several of these are Chromium-only.
 */

export type GpuInfo = {
  webgl2Available: boolean
  webglVendor: string | null
  webglRenderer: string | null
  /** Renderer string looks like a software rasteriser (SwiftShader, llvmpipe). */
  softwareRendered: boolean
  webgpuAvailable: boolean
  webgpuVendor: string | null
  webgpuArchitecture: string | null
  webgpuDevice: string | null
  webgpuDescription: string | null
}

/** What this browser is able to tell the harness, recorded in the report. */
export type MeasurementCapabilities = {
  requestVideoFrameCallback: boolean
  longTasks: boolean
  jsHeap: boolean
}

export type SystemSpecs = {
  collectedAt: string
  userAgent: string
  platform: string | null
  platformVersion: string | null
  architecture: string | null
  bitness: string | null
  model: string | null
  browserVersion: string | null
  logicalCores: number | null
  deviceMemoryGb: number | null
  gpu: GpuInfo
  screen: {
    width: number
    height: number
    devicePixelRatio: number
    colorDepth: number
  }
  battery: { charging: boolean; levelPct: number } | null
  capabilities: MeasurementCapabilities
  timezone: string | null
  language: string | null
}

const SOFTWARE_RENDERER_PATTERN =
  /swiftshader|swangle|llvmpipe|software|basic render|microsoft basic/i

type UserAgentDataLike = {
  platform?: string
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, string>>
}

type BatteryLike = { charging: boolean; level: number }

type NavigatorLike = Navigator & {
  deviceMemory?: number
  userAgentData?: UserAgentDataLike
  getBattery?: () => Promise<BatteryLike>
}

type GpuAdapterLike = {
  info?: {
    vendor?: string
    architecture?: string
    device?: string
    description?: string
  }
  requestAdapterInfo?: () => Promise<{
    vendor?: string
    architecture?: string
    device?: string
    description?: string
  }>
}

type GpuLike = {
  requestAdapter?: () => Promise<GpuAdapterLike | null>
}

function readWebglInfo(): Pick<
  GpuInfo,
  'webgl2Available' | 'webglVendor' | 'webglRenderer' | 'softwareRendered'
> {
  const empty = {
    webgl2Available: false,
    webglVendor: null,
    webglRenderer: null,
    softwareRendered: false,
  }
  try {
    const canvas = document.createElement('canvas')
    const gl2 = canvas.getContext('webgl2')
    const gl = (gl2 ??
      canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return empty

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    const vendor = debugInfo
      ? (gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string)
      : gl.getParameter(gl.VENDOR)
    const renderer = debugInfo
      ? (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string)
      : gl.getParameter(gl.RENDERER)

    // Browsers cap live contexts (~16) and this probe runs more than once
    // per session, so hand it back rather than waiting for GC.
    gl.getExtension('WEBGL_lose_context')?.loseContext()

    return {
      webgl2Available: !!gl2,
      webglVendor: vendor ?? null,
      webglRenderer: renderer ?? null,
      softwareRendered: SOFTWARE_RENDERER_PATTERN.test(String(renderer ?? '')),
    }
  } catch {
    return empty
  }
}

async function readWebgpuInfo(): Promise<
  Pick<
    GpuInfo,
    | 'webgpuAvailable'
    | 'webgpuVendor'
    | 'webgpuArchitecture'
    | 'webgpuDevice'
    | 'webgpuDescription'
  >
> {
  const empty = {
    webgpuAvailable: false,
    webgpuVendor: null,
    webgpuArchitecture: null,
    webgpuDevice: null,
    webgpuDescription: null,
  }
  try {
    // Cast through unknown: lib.dom types GPUAdapter without the older
    // requestAdapterInfo(), which Chrome still uses before adapter.info.
    const gpu = (navigator as unknown as { gpu?: GpuLike }).gpu
    if (!gpu?.requestAdapter) return empty

    const adapter = await gpu.requestAdapter()
    if (!adapter) return empty

    const info = adapter.info ?? (await adapter.requestAdapterInfo?.())
    return {
      webgpuAvailable: true,
      webgpuVendor: info?.vendor ?? null,
      webgpuArchitecture: info?.architecture ?? null,
      webgpuDevice: info?.device ?? null,
      webgpuDescription: info?.description ?? null,
    }
  } catch {
    return empty
  }
}

async function readHighEntropyUa(): Promise<{
  platform: string | null
  platformVersion: string | null
  architecture: string | null
  bitness: string | null
  model: string | null
  browserVersion: string | null
}> {
  const empty = {
    platform: null,
    platformVersion: null,
    architecture: null,
    bitness: null,
    model: null,
    browserVersion: null,
  }
  try {
    const uaData = (navigator as NavigatorLike).userAgentData
    if (!uaData?.getHighEntropyValues) {
      return { ...empty, platform: uaData?.platform ?? null }
    }
    const values = await uaData.getHighEntropyValues([
      'platform',
      'platformVersion',
      'architecture',
      'bitness',
      'model',
      'uaFullVersion',
    ])
    return {
      platform: values.platform ?? null,
      platformVersion: values.platformVersion ?? null,
      architecture: values.architecture ?? null,
      bitness: values.bitness ?? null,
      model: values.model || null,
      browserVersion: values.uaFullVersion ?? null,
    }
  } catch {
    return empty
  }
}

async function readBattery(): Promise<SystemSpecs['battery']> {
  try {
    const getBattery = (navigator as NavigatorLike).getBattery
    if (!getBattery) return null
    const battery = await getBattery.call(navigator)
    return {
      charging: battery.charging,
      levelPct: Math.round(battery.level * 100),
    }
  } catch {
    return null
  }
}

export async function collectSystemSpecs(): Promise<SystemSpecs> {
  const [ua, webgpu, battery] = await Promise.all([
    readHighEntropyUa(),
    readWebgpuInfo(),
    readBattery(),
  ])

  return {
    collectedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    ...ua,
    logicalCores: navigator.hardwareConcurrency ?? null,
    deviceMemoryGb: (navigator as NavigatorLike).deviceMemory ?? null,
    gpu: { ...readWebglInfo(), ...webgpu },
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      devicePixelRatio: window.devicePixelRatio,
      colorDepth: window.screen.colorDepth,
    },
    battery,
    capabilities: {
      requestVideoFrameCallback: SUPPORTS_RVFC,
      longTasks: SUPPORTS_LONG_TASKS,
      jsHeap: 'memory' in performance,
    },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
    language: navigator.language ?? null,
  }
}

/** One-line summary of how the machine is rendering, for the results header. */
export function describeGpu(gpu: GpuInfo): string {
  if (!gpu.webglRenderer) return 'unknown'
  if (gpu.softwareRendered) return `software (${gpu.webglRenderer})`
  return gpu.webglRenderer
}
