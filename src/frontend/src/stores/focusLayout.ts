import { proxy, subscribe } from 'valtio'
import { STORAGE_KEYS } from '@/utils/storageKeys'
import { DEFAULT_CAROUSEL_RATIO } from '@/features/layout/utils/focusLayoutSplit'

type State = {
  carouselRatio: number
}

function getFocusLayoutState(): State {
  const stored = Number(localStorage.getItem(STORAGE_KEYS.FOCUS_LAYOUT))
  return {
    carouselRatio:
      Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_CAROUSEL_RATIO,
  }
}

export const focusLayoutStore = proxy<State>(getFocusLayoutState())

subscribe(focusLayoutStore, () => {
  localStorage.setItem(
    STORAGE_KEYS.FOCUS_LAYOUT,
    String(focusLayoutStore.carouselRatio)
  )
})

export const setCarouselRatio = (ratio: number): void => {
  focusLayoutStore.carouselRatio = ratio
}

export const resetCarouselRatio = (): void => {
  focusLayoutStore.carouselRatio = DEFAULT_CAROUSEL_RATIO
}
