import { supportStore } from '@/stores/support'

declare global {
  interface Window {
    _lasuite_widget?: unknown[]
  }
}

type WidgetOptions = {
  api: string
  channel: string
  locale: string
  email?: string
}

const ROOT_ID = 'lasuite-widget-support-root'
const OPENED_EVENT = 'lasuite-widget-support-opened'
const SUCCESS_EVENT = 'lasuite-widget-support-success'
const CLOSED_EVENT = 'lasuite-widget-support-closed'
const TIMEOUT_MS = 10_000

const WIDGET_CSS = `@media (min-width: 48em) {
  [role='dialog'] {
    top: 50%;
    right: auto;
    bottom: auto;
    left: 50%;
    transform: translate(-50%, -50%);
  }
}
[role='status'] {
  display: none;
}`

const styleWidget = () => {
  const shadowRoot = document.getElementById(ROOT_ID)?.shadowRoot
  if (!shadowRoot) return
  const style = document.createElement('style')
  style.textContent = WIDGET_CSS
  shadowRoot.appendChild(style)
}

let returnFocusTo: HTMLElement | null = null

// The widget removes the form without moving focus, which drops it on <body>.
const restoreFocus = () => {
  const activeEl = document.activeElement
  const isFocusLost = activeEl === document.body || activeEl?.id === ROOT_ID
  if (isFocusLost && returnFocusTo?.isConnected) {
    returnFocusTo.focus({ preventScroll: true })
  }
}

export const subscribeToSupportWidget = () => {
  const onOpened = () => {
    styleWidget()
    supportStore.status = 'open'
  }
  const onSuccess = () => {
    supportStore.showSentConfirmation = true
    restoreFocus()
  }
  const onClosed = () => {
    supportStore.status = 'closed'
    restoreFocus()
    returnFocusTo = null
  }

  document.addEventListener(OPENED_EVENT, onOpened)
  document.addEventListener(SUCCESS_EVENT, onSuccess)
  document.addEventListener(CLOSED_EVENT, onClosed)
  return () => {
    document.removeEventListener(OPENED_EVENT, onOpened)
    document.removeEventListener(SUCCESS_EVENT, onSuccess)
    document.removeEventListener(CLOSED_EVENT, onClosed)
  }
}

const resolveTrigger = () => {
  const activeEl = document.activeElement as HTMLElement | null
  if (activeEl?.getAttribute('role') === 'menuitem') {
    return document.querySelector<HTMLElement>('#room-options-trigger')
  }
  return activeEl
}

let scriptPromise: Promise<void> | undefined

const loadScript = (src: string): Promise<void> => {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    const timeout = window.setTimeout(
      () => fail(new Error(`Timed out loading ${src}`)),
      TIMEOUT_MS
    )
    const fail = (error: Error) => {
      window.clearTimeout(timeout)
      script.remove()
      scriptPromise = undefined
      reject(error)
    }

    script.src = src
    script.async = true
    script.onload = () => {
      window.clearTimeout(timeout)
      resolve()
    }
    script.onerror = () => fail(new Error(`Failed to load ${src}`))
    document.body.appendChild(script)
  })

  return scriptPromise
}

const initWidget = (options: WidgetOptions): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const onOpened = () => {
      window.clearTimeout(timeout)
      resolve()
    }
    const timeout = window.setTimeout(() => {
      document.removeEventListener(OPENED_EVENT, onOpened)
      reject(new Error('Support widget did not open'))
    }, TIMEOUT_MS)

    document.addEventListener(OPENED_EVENT, onOpened, { once: true })
    window._lasuite_widget?.push(['support', 'init', options])
  })

export const openSupportWidget = async (
  scriptUrl: string,
  options: WidgetOptions
) => {
  if (supportStore.status !== 'closed') return

  supportStore.status = 'pending'
  returnFocusTo = resolveTrigger()
  try {
    await loadScript(scriptUrl)
    await initWidget(options)
  } catch (error) {
    supportStore.status = 'closed'
    returnFocusTo = null
    throw error
  }
}
