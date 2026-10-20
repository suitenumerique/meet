import { useLocationProperty } from 'wouter/use-browser-location'

const hashSelector = () =>
  typeof window !== 'undefined' ? window.location.hash : ''

/**
 * Reactive window.location.hash, subscribed to wouter's navigation
 * events (the same low-level primitive wouter builds useSearch upon).
 */
export const useHash = (): string => useLocationProperty(hashSelector, () => '')
