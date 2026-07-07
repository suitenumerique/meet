import { useConfig } from '@/api/useConfig'
import { getVisibleToolPlugins, useRegistryVersion } from './registry'

/**
 * Reactive: whether the tool plugin `id` survives visibility resolution
 * (isEnabled, replaces, hidden_tools). Entry points that openSubPanel(id) must
 * gate on this — Tools only renders panels of visible plugins.
 */
export const useIsToolVisible = (id: string): boolean => {
  const { data } = useConfig()
  useRegistryVersion()
  return getVisibleToolPlugins(data).some((p) => p.id === id)
}
