import type { ComponentType, LazyExoticComponent, ReactNode } from 'react'
import type { ApiConfig } from '@/api/useConfig'

/** A plugin sub-panel component, plain or `React.lazy(...)`. */
export type PluginPanelComponent =
  | ComponentType
  | LazyExoticComponent<ComponentType>

/** A plugin sub-panel: its lazy/plain component + i18n options. */
export interface PluginPanel {
  /** `React.lazy(...)` => first code-split of the tree. */
  Component: PluginPanelComponent
  /** Defaults to `'panel.heading'` in the plugin's `i18nNamespace`. */
  headingKey?: string
  /** Defaults to `'panel.content'` (close-button aria) in the ns. */
  contentKey?: string
}

/** A Tools sub-panel "app" contribution. */
export interface ToolContribution {
  icon: ReactNode
  /** Defaults to `'tool.title'` in the plugin's `i18nNamespace`. */
  titleKey?: string
  /** Defaults to `'tool.body'` in the plugin's `i18nNamespace`. */
  descriptionKey?: string
  panel: PluginPanel
}

/** A headless caption-controller contribution that claims the caption bus. */
export interface CaptionControllerContribution {
  /** Bus-ownership priority (lower wins/native, higher overrides). */
  priority?: number
  /** Headless component (returns null) that owns the bus while mounted. */
  Controller: PluginPanelComponent
  /** Runtime gate read from `GET config/`; defaults to always-on. */
  isEnabled?: (config?: ApiConfig) => boolean
}

/** A plugin manifest: identity/gating fields plus what it `contributes`. */
export interface Plugin {
  /** Stable reverse-DNS `vendor.feature` id; also `layoutStore.activeSubPanelId`. */
  id: string
  /** Plugin ABI version the manifest targets (caret-matched by the host). */
  apiVersion: string
  /** i18n namespace loaded on demand; kebab-case, never the id. */
  i18nNamespace: string
  /** Deterministic order in the menu (lower wins, default 0). */
  order?: number
  /** Runtime gate read from `GET config/` — no rebuild to (de)activate. */
  isEnabled: (config?: ApiConfig) => boolean
  /** Ids of OTHER tools hidden when this one is active. */
  replaces?: (config?: ApiConfig) => string[]
  contributes: {
    tool?: ToolContribution
    captionController?: CaptionControllerContribution
  }
}

/** Identity helper that types a plugin manifest at its definition site. */
export const definePlugin = (p: Plugin): Plugin => p
