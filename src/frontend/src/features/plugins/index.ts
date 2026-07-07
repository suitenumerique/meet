// Plugin framework public API (registry, loader, host ABI). Built-in plugins are
// registered by the app composition root (main.tsx), not here, so this barrel
// stays free of concrete product features.
export * from './types'
export * from './config'
export * from './registry'
export * from './loader'
export * from './host'
export * from './PanelErrorBoundary'
export * from './useIsToolVisible'
