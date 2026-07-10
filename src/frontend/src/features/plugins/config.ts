import { useConfig } from '@/api/useConfig'

/**
 * Open interface each plugin augments via declaration merging to type its own
 * config slice (TanStack Router's `Register` pattern).
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PluginConfigMap {}

/** Union of the ids that have declared a typed config slice. */
export type KnownPluginId = keyof PluginConfigMap

/** Typed accessor for a plugin's config slice from the `plugins` namespace. */
export function usePluginConfig<K extends KnownPluginId>(
  id: K
): PluginConfigMap[K] | undefined {
  const { data } = useConfig()
  // Cast at the network boundary: `plugins` mixes typed slices with a Record fallback.
  return data?.plugins?.[id] as PluginConfigMap[K] | undefined
}
