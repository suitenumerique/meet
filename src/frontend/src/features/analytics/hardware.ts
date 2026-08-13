export interface HardwareSnapshot {
  /** navigator.hardwareConcurrency — logical CPU cores. */
  cpu_cores: number | null
  /** navigator.deviceMemory — RAM in GiB, bucketed by the browser (Chromium only). */
  device_memory_gb: number | null
  /** performance.memory.jsHeapSizeLimit in MB (Chromium only, non-standard). */
  js_heap_limit_mb: number | null
  /** performance.memory.usedJSHeapSize in MB (Chromium only, non-standard). */
  js_heap_used_mb: number | null
  /** Battery level 0..1 via navigator.getBattery() (Chromium only). */
  battery_level: number | null
  /** Whether the device is plugged in, via navigator.getBattery(). */
  battery_charging: boolean | null
}

const BATTERY_TIMEOUT_MS = 1_000

const toMb = (bytes: unknown): number | null =>
  typeof bytes === 'number' ? Math.round(bytes / (1024 * 1024)) : null

export const collectHardwareSnapshot = async (): Promise<HardwareSnapshot> => {
  const snapshot: HardwareSnapshot = {
    cpu_cores: null,
    device_memory_gb: null,
    js_heap_limit_mb: null,
    js_heap_used_mb: null,
    battery_level: null,
    battery_charging: null,
  }

  try {
    snapshot.cpu_cores = navigator.hardwareConcurrency ?? null

    const nav = navigator as Navigator & {
      deviceMemory?: number
      userAgentData?: { mobile?: boolean; platform?: string }
      getBattery?: () => Promise<{ level: number; charging: boolean }>
    }

    snapshot.device_memory_gb = nav.deviceMemory ?? null

    const memory = (
      performance as Performance & {
        memory?: { jsHeapSizeLimit?: number; usedJSHeapSize?: number }
      }
    ).memory
    snapshot.js_heap_limit_mb = toMb(memory?.jsHeapSizeLimit)
    snapshot.js_heap_used_mb = toMb(memory?.usedJSHeapSize)

    if (typeof nav.getBattery === 'function') {
      // getBattery can hang on some platforms — don't let it delay the event.
      const battery = await Promise.race([
        nav.getBattery(),
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), BATTERY_TIMEOUT_MS)
        ),
      ]).catch(() => null)
      if (battery) {
        snapshot.battery_level = battery.level
        snapshot.battery_charging = battery.charging
      }
    }
  } catch {
    // telemetry must never break the app
  }

  return snapshot
}
