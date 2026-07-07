import { proxy } from 'valtio'
import type { Tone } from '@/primitives/tone'

/** Banner severity the host maps to a themed background color in `<Banners/>`. */
export type BannerTone = Tone

/** A single ambient banner. `id` is the stable dedup key owned by its producer. */
export interface Banner {
  id: string
  text: string
  icon?: string
  tone?: BannerTone
  /** Optional DOM hook for automation; falls back to `banner-<id>`. */
  testId?: string
}

interface BannerState {
  banners: Banner[]
}

/** The banner payload a producer passes to `showBanner` (everything but `id`). */
export type ShowBannerOptions = Omit<Banner, 'id'>

/** Host-owned valtio store backing the ambient-banner surface. */
export const bannerStore = proxy<BannerState>({ banners: [] })

/** Show or replace-in-place the banner registered under `id`. */
export const showBanner = (id: string, opts: ShowBannerOptions): void => {
  const banner: Banner = { id, ...opts }
  const idx = bannerStore.banners.findIndex((b) => b.id === id)
  if (idx === -1) {
    bannerStore.banners.push(banner)
  } else {
    bannerStore.banners[idx] = banner
  }
}

/** Hide the banner registered under `id`. A no-op when none is active for it. */
export const hideBanner = (id: string): void => {
  const idx = bannerStore.banners.findIndex((b) => b.id === id)
  if (idx !== -1) {
    bannerStore.banners.splice(idx, 1)
  }
}
