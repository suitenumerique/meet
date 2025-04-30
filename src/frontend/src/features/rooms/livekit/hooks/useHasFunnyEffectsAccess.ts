import { useFeatureFlagEnabled } from 'posthog-js/react'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'
import { FeatureFlags } from '@/features/analytics/enums'
import useKonami from '@/features/rooms/livekit/hooks/useKonami'
import { konamiStore } from '@/stores/konami'
import { useSnapshot } from 'valtio'

export const useHasFunnyEffectsAccess = () => {
  const featureEnabled = useFeatureFlagEnabled(FeatureFlags.faceLandmarks)
  const isAnalyticsEnabled = useIsAnalyticsEnabled()

  const konamiSnap = useSnapshot(konamiStore)

  useKonami(
    () =>
      (konamiStore.areFunnyEffectsEnabled = !konamiSnap.areFunnyEffectsEnabled)
  )

  return (
    (featureEnabled || !isAnalyticsEnabled) && konamiSnap.areFunnyEffectsEnabled
  )
}
