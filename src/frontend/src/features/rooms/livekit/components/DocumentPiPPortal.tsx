import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDocumentPiP } from '../hooks/useDocumentPiP'

const ensureBaseStyles = (target: Document) => {
  if (target.getElementById('pip-base-styles')) return
  const style = target.createElement('style')
  style.id = 'pip-base-styles'
  style.textContent = `
    html, body { margin: 0; padding: 0; height: 100%; background: #0b0f19; }
    * { box-sizing: border-box; }
  `
  target.head.appendChild(style)
}

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
    return createPortal(children, container)
  }, [children, container])

  return portal
}

