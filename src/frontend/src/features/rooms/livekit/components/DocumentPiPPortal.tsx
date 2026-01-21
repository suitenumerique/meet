import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDocumentPiP } from '../hooks/useDocumentPiP'
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
}) => {
  const { openPiP, closePiP, pipWindow, isSupported } = useDocumentPiP({
    width,
    height,
  })
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const containerRef = useRef<HTMLElement | null>(null)

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

  useEffect(() => {
    if (!pipWindow) return
    const handleClose = () => {
      // Reset container so reopening PiP mounts a fresh root.
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
      // "UNSAFE" because it bypasses react-aria's default portal container.
      // We need it to target the PiP document; otherwise overlays render in the main window.
      <UNSAFE_PortalProvider getContainer={() => container}>
        {children}
      </UNSAFE_PortalProvider>,
      container
    )
  }, [children, container])

  return portal
}

