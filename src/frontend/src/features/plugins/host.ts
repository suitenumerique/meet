// The narrow, framework-only host ABI a deploy-time plugin bundle receives from
// `activate(host)`. Every field is a frozen contract external bundles compile against.
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as ReactJSXRuntime from 'react/jsx-runtime'
import * as Valtio from 'valtio'
import { proxy, useSnapshot, subscribe } from 'valtio'
import * as LivekitClient from 'livekit-client'
import * as LivekitComponents from '@livekit/components-react'
import { useRoomContext } from '@livekit/components-react'
import i18next from 'i18next'
import { Icon, Button, Text, Switch, Field } from '@/primitives'
import { useConfig } from '@/api/useConfig'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { useUser } from '@/features/auth/api/useUser'
import { useIsAdminOrOwner } from '@/features/rooms/livekit/hooks/useIsAdminOrOwner'
import { useRoomMetadata } from '@/features/recording/hooks/useRoomMetadata'
import { fetchApi } from '@/api/fetchApi'
import { ApiError } from '@/api/ApiError'
import { FeatureFlags } from '@/features/analytics/enums'
import { usePluginConfig } from './config'
import type { Plugin } from './types'
import { registerPlugin } from './registry'
import { useBroadcast } from './broadcast'
import {
  claim,
  release,
  push,
  replace,
  currentOwnerId,
} from '@/features/subtitle/captionBus'
import {
  showBanner,
  hideBanner,
  type BannerTone,
} from '@/features/banner/bannerStore'
import {
  setCaptionDecoration,
  clearCaptionDecoration,
  showCaptionPopover,
  type CaptionDecorationOptions,
  type CaptionPopoverOptions,
} from '@/features/subtitle/captionButtonStore'
import { notify } from '@/features/notifications/notify'
import { NoAccessView } from '@/features/recording/components/NoAccessView'
import { pluginContext } from './context'

/** ABI version the host implements; the loader admits a bundle only when the host satisfies its `^apiVersion`. */
export const HOST_API_VERSION = '1.0.0'

/** Host major of every shared singleton; the loader refuses a bundle whose declared major diverges. */
export const HOST_PEERS: Record<string, string> = {
  react: '18',
  'react-dom': '18',
  'livekit-client': '2',
  '@livekit/components-react': '2',
  valtio: '2',
}

/**
 * The ABI handed to a bundle's `activate(host)`. Shared singletons are passed BY
 * REFERENCE so hook dispatchers and valtio proxies stay identity-stable across
 * the host↔bundle boundary.
 */
export interface MeetPluginHost {
  /** ABI version the host implements. */
  readonly apiVersion: string
  /** The one host React instance (also published on `window.React`). */
  readonly react: typeof React
  /** The one host valtio instance (proxy/useSnapshot/subscribe). */
  readonly valtio: Pick<typeof Valtio, 'proxy' | 'useSnapshot' | 'subscribe'>
  /** LiveKit React bindings the host exposes (room context only, for now). */
  readonly livekit: Pick<typeof LivekitComponents, 'useRoomContext'>
  /** Register a plugin manifest into the host registry. */
  registerPlugin(plugin: Plugin): void
  /** The priority-owned caption bus. */
  readonly captionBus: {
    claim: typeof claim
    release: typeof release
    push: typeof push
    replace: typeof replace
    current: typeof currentOwnerId
  }
  /** i18n seam — add a resource bundle to the host i18next singleton. */
  readonly i18n: {
    addResourceBundle: typeof i18next.addResourceBundle
  }
  /** Host-owned ambient-banner surface: show/hide an overlay pill keyed by `id`. */
  readonly banner: {
    show(
      id: string,
      opts: { text: string; icon?: string; tone?: BannerTone; testId?: string }
    ): void
    hide(id: string): void
  }
  /** Decoration surface for the CC button: badge/ring/label/popover keyed by `id`. */
  readonly captionButton: {
    setDecoration(id: string, opts: CaptionDecorationOptions): void
    clearDecoration(id: string): void
    popover(id: string, opts: CaptionPopoverOptions): void
  }
  /** Generic, product-agnostic toast: enqueue a plain message. */
  readonly notify: typeof notify
  /** Generic "no access" render/guard a surface shows when the user lacks rights. */
  readonly accessGate: typeof NoAccessView
  /** Frozen primitive set (Panda-styled) a bundle renders with. */
  readonly primitives: {
    Icon: typeof Icon
    Button: typeof Button
    Text: typeof Text
    Switch: typeof Switch
    Field: typeof Field
  }
  /** Read the deployment config (`GET config/`). */
  useConfig: typeof useConfig
  /** Read a plugin's typed config slice. */
  usePluginConfig: typeof usePluginConfig
  /** One host-owned valtio proxy per plugin id (cross-surface escape hatch). */
  pluginContext: typeof pluginContext

  // Data/service seams: room identity, user, admin rights, metadata, fetch.
  /** Read the current room's API record (identity, `is_administrable`, …). */
  useRoomData: typeof useRoomData
  /** Read the currently logged-in user (auth state + profile). */
  useUser: typeof useUser
  /** Whether the current user is an admin/owner of the room. */
  useIsAdminOrOwner: typeof useIsAdminOrOwner
  /** Parsed LiveKit room metadata (broadcast to every participant). */
  useRoomMetadata: typeof useRoomMetadata
  /** Peer-to-peer broadcast over LiveKit participant data, with resync + TTL. */
  useBroadcast: typeof useBroadcast
  /** The host's authenticated fetch (credentials + CSRF + `apiUrl`). */
  fetchApi: typeof fetchApi
  /** Error thrown by `fetchApi` on a non-2xx response (`statusCode`/`body`). */
  ApiError: typeof ApiError
  /** Host analytics enums (feature-flag keys a surface gates itself on). */
  readonly analytics: {
    FeatureFlags: typeof FeatureFlags
  }
}

/**
 * Publish shared singletons on `window` before any bundle loads. Bundles are
 * built with these globals as externals, so `react` inside a bundle resolves to
 * `window.React` = the one host React. Idempotent.
 */
export const publishHostGlobals = (): void => {
  window.React = React
  window.ReactDOM = ReactDOM
  window.ReactDOMClient = ReactDOMClient
  window.ReactJSXRuntime = ReactJSXRuntime
  window.__MEET_VALTIO__ = Valtio
  window.__MEET_LIVEKIT_CLIENT__ = LivekitClient
  window.__MEET_LIVEKIT_COMPONENTS__ = LivekitComponents
  window.__MEET_PLUGINS__ ??= {}
  window.__meetRegisterPlugin__ = (id, mod) => {
    ;(window.__MEET_PLUGINS__ ??= {})[id] = mod
  }
}

/** Build the single host object handed to every plugin's `activate(host)`. */
export const buildHost = (): MeetPluginHost => ({
  apiVersion: HOST_API_VERSION,
  react: React,
  valtio: { proxy, useSnapshot, subscribe },
  livekit: { useRoomContext },
  registerPlugin,
  captionBus: { claim, release, push, replace, current: currentOwnerId },
  i18n: { addResourceBundle: i18next.addResourceBundle.bind(i18next) },
  banner: { show: showBanner, hide: hideBanner },
  captionButton: {
    setDecoration: setCaptionDecoration,
    clearDecoration: clearCaptionDecoration,
    popover: showCaptionPopover,
  },
  notify,
  accessGate: NoAccessView,
  primitives: { Icon, Button, Text, Switch, Field },
  useConfig,
  usePluginConfig,
  pluginContext,
  useRoomData,
  useUser,
  useIsAdminOrOwner,
  useRoomMetadata,
  useBroadcast,
  fetchApi,
  ApiError,
  analytics: { FeatureFlags },
})
