import { proxy } from 'valtio'

export type PerformanceModeTrigger = 'cpu' | 'manual'

export const performanceModeStore = proxy<{
  enabled: boolean
  trigger: PerformanceModeTrigger | null
  userDeclinedAuto: boolean
}>({
  enabled: false,
  trigger: null,
  userDeclinedAuto: false,
})

export const enablePerformanceMode = (trigger: PerformanceModeTrigger) => {
  if (performanceModeStore.enabled) return
  performanceModeStore.enabled = true
  performanceModeStore.trigger = trigger
}

export const disablePerformanceMode = ({
  declinedAuto = false,
}: { declinedAuto?: boolean } = {}) => {
  if (declinedAuto) {
    performanceModeStore.userDeclinedAuto = true
  }
  if (!performanceModeStore.enabled) return
  performanceModeStore.enabled = false
  performanceModeStore.trigger = null
}
