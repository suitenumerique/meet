import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useDocumentPiP } from '../hooks/useDocumentPiP'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { useRestoreFocus } from '@/hooks/useRestoreFocus'
import { UNSAFE_PortalProvider } from '@react-aria/overlays'

// Minimal base styles so the PiP window renders correctly on first paint.
const ensureBaseStyles = (target: Document) => {
  if (target.getElementById('pip-base-styles')) return
  const style = target.createElement('style')
  style.id = 'pip-base-styles'
  style.textContent = `
    html, body { margin: 0; padding: 0; height: 100%; background: #0b0f19; }
    body { overflow: hidden; }
    * { box-sizing: border-box; }
  `
  target.head.appendChild(style)
}

// Clone existing styles to keep the PiP window visually consistent.
const copyStyles = (source: Document, target: Document) => {
  if (target.getElementById('pip-style-clone')) return
  const marker = target.createElement('meta')
  marker.id = 'pip-style-clone'
  target.head.appendChild(marker)

  source.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
    const cloned = node.cloneNode(true) as HTMLElement
    target.head.appendChild(cloned)
  })
}

const syncThemeAttribute = (source: Document, target: Document) => {
  const theme = source.documentElement.getAttribute('data-lk-theme')
  if (theme) {
    target.documentElement.setAttribute('data-lk-theme', theme)
  }
}

const cssVarNameCacheByElement = new WeakMap<HTMLElement, string[]>()
const cssVarNameCacheByUri = new Map<string, string[]>()

const syncCssVariables = (source: Document, target: Document) => {
  const sourceView = source.defaultView
  if (!sourceView) return

  const getCachedVarNames = () => {
    const docEl = source.documentElement
    if (!docEl) return []

    const cachedByElement = cssVarNameCacheByElement.get(docEl)
    if (cachedByElement) return cachedByElement

    const cachedByUri = source.baseURI
      ? cssVarNameCacheByUri.get(source.baseURI)
      : undefined
    if (cachedByUri) return cachedByUri

    const varNames = new Set<string>()
    const collectVarsFrom = (element: HTMLElement | null) => {
      if (!element) return
      const styles = sourceView.getComputedStyle(element)
      for (let i = 0; i < styles.length; i += 1) {
        const property = styles[i]
        if (property.startsWith('--')) {
          varNames.add(property)
        }
      }
    }

    collectVarsFrom(source.documentElement)
    collectVarsFrom(source.body)

    const result = Array.from(varNames)
    cssVarNameCacheByElement.set(docEl, result)
    if (source.baseURI) {
      cssVarNameCacheByUri.set(source.baseURI, result)
    }
    return result
  }

  const varNames = getCachedVarNames()
  if (!varNames.length) return

  const rootStyles = sourceView.getComputedStyle(source.documentElement)
  const bodyStyles = source.body
    ? sourceView.getComputedStyle(source.body)
    : null

  varNames.forEach((property) => {
    const bodyValue = bodyStyles?.getPropertyValue(property)
    const value = bodyValue || rootStyles.getPropertyValue(property)
    if (value) {
      target.documentElement.style.setProperty(property, value)
    }
  })
}

/**
 * React portal into a Document Picture-in-Picture window. Handles window
 * lifecycle, style/theme sync and routes React Aria overlays via
 * `UNSAFE_PortalProvider` so they render inside the PiP document.
 */
export const DocumentPiPPortal = ({
  isOpen,
  width,
  height,
  children,
  onClose,
}: {
  isOpen: boolean
  width?: number
  height?: number
  children: React.ReactNode
  onClose?: () => void
}): ReactNode => {
  const { openPiP, closePiP, pipWindow, isSupported } = useDocumentPiP({
    width,
    height,
  })
  const { t } = useTranslation('rooms', {
    keyPrefix: 'options.items.pictureInPicture',
  })
  const announce = useScreenReaderAnnounce()
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const containerRef = useRef<HTMLElement | null>(null)
  const prevOpenRef = useRef(false)

  useEffect(() => {
    if (!isOpen) {
      closePiP()
      setContainer(null)
      containerRef.current = null
      return
    }

    if (!isSupported) return

    let cancelled = false
    openPiP().then((win) => {
      if (!win || cancelled) return
      const doc = win.document
      ensureBaseStyles(doc)
      copyStyles(document, doc)
      syncThemeAttribute(document, doc)
      syncCssVariables(document, doc)

      doc.documentElement.setAttribute('lang', document.documentElement.lang)
      doc.title = t('windowLabel')

      const existingContainer = containerRef.current
      if (!existingContainer || existingContainer.ownerDocument !== doc) {
        const nextContainer = doc.createElement('div')
        nextContainer.id = 'pip-root'
        nextContainer.style.width = '100%'
        nextContainer.style.height = '100%'
        nextContainer.style.display = 'flex'
        nextContainer.style.alignItems = 'stretch'
        nextContainer.style.justifyContent = 'center'
        doc.body.appendChild(nextContainer)
        containerRef.current = nextContainer
        setContainer(nextContainer)
      } else {
        setContainer(existingContainer)
      }
    })

    return () => {
      cancelled = true
    }
  }, [closePiP, isOpen, isSupported, openPiP])

  // Focus stays on the trigger; PiP is announced as an auxiliary surface.
  useEffect(() => {
    const wasOpen = prevOpenRef.current
    prevOpenRef.current = isOpen

    if (isOpen && !wasOpen) {
      announce(t('opened'), 'polite')
    }
    if (!isOpen && wasOpen) {
      announce(t('closed'), 'polite')
    }
  }, [isOpen, announce, t])

  useRestoreFocus(isOpen, { restoreFocusRaf: true })

  // Escape from either document closes PiP (unless a nested overlay handled it).
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      onClose?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    pipWindow?.document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      pipWindow?.document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose, pipWindow])

  useEffect(() => {
    if (!pipWindow) return
    const handleClose = () => {
      containerRef.current = null
      setContainer(null)
      onClose?.()
    }
    pipWindow.addEventListener('pagehide', handleClose)
    pipWindow.addEventListener('beforeunload', handleClose)
    return () => {
      pipWindow.removeEventListener('pagehide', handleClose)
      pipWindow.removeEventListener('beforeunload', handleClose)
    }
  }, [onClose, pipWindow])

  const portal = useMemo(() => {
    if (!container) return null
    return createPortal(
      <UNSAFE_PortalProvider getContainer={() => container}>
        {children}
      </UNSAFE_PortalProvider>,
      container
    )
  }, [children, container])

  return portal as unknown as ReactNode
}
