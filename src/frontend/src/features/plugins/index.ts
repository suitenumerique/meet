// Plugin framework public API (registry). Built-in plugins are registered by
// the app composition root (main.tsx), not here, so this barrel stays free of
// concrete product features.
export * from './types'
export * from './config'
export * from './registry'
export * from './PanelErrorBoundary'
export * from './useIsToolVisible'
