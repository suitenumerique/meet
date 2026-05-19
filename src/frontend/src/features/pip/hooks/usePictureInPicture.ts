import { ref, useSnapshot } from 'valtio'
import { useCallback, useMemo } from 'react'
import { IS_PIP_SUPPORTED } from '@/features/pip/utils'
import { documentPictureInPictureStore } from '@/stores/documentPictureInPicture'

export const usePictureInPicture = () => {
  const { window: pipWindowRef } = useSnapshot(documentPictureInPictureStore)

  const isOpen = useMemo(() => {
    return !!pipWindowRef && !pipWindowRef.closed
  }, [pipWindowRef])

  const syncStyles = useCallback((pipWindow: Window) => {
    document.head
      .querySelectorAll('link[rel="stylesheet"], style')
      .forEach((node) => {
        pipWindow.document.head.appendChild(node.cloneNode(true))
      })
    pipWindow.document.documentElement.className =
      document.documentElement.className
    pipWindow.document.documentElement.style.cssText =
      document.documentElement.style.cssText

    const theme = document.documentElement.dataset.lkTheme
    if (theme) {
      pipWindow.document.documentElement.dataset.lkTheme = theme
    }
  }, [])

  const initializePortalContainer = useCallback((pipWindow: Window) => {
    const existing = pipWindow.document.getElementById('root')
    if (existing) return existing

    const newContainer = pipWindow.document.createElement('div')
    newContainer.id = 'root'
    newContainer.style.width = '100%'
    newContainer.style.height = '100%'

    pipWindow.document.body.appendChild(newContainer)
  }, [])

  const initializeTitleAndLanguage = useCallback(
    (pipWindow: Window, title: string) => {
      const parentLang = document?.documentElement.lang || 'en'
      pipWindow.document.documentElement.setAttribute('lang', parentLang)
      pipWindow.document.title = title
    },
    []
  )

  const open = useCallback(
    async (width = 400, height = 480) => {
      if (!IS_PIP_SUPPORTED) return null
      if (isOpen) return null

      try {
        const pipWindow =
          await // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).documentPictureInPicture.requestWindow({
            width,
            height,
          })

        initializeTitleAndLanguage(pipWindow, 'wip')
        initializePortalContainer(pipWindow)
        syncStyles(pipWindow)

        const cleanUp = () => {
          if (documentPictureInPictureStore.window === pipWindow) {
            documentPictureInPictureStore.window = null
          }
        }
        pipWindow.addEventListener('pagehide', () => cleanUp(), { once: true })
        pipWindow.addEventListener('beforeunload', () => cleanUp(), {
          once: true,
        })
        documentPictureInPictureStore.window = ref(pipWindow)
      } catch (error) {
        // Avoid unhandled rejections if the user blocks or closes the request.
        console.error('Failed to open Picture-in-Picture window', error)
        return null
      }
    },
    [initializePortalContainer, initializeTitleAndLanguage, isOpen, syncStyles]
  )

  const close = useCallback(() => {
    documentPictureInPictureStore.window?.close()
    documentPictureInPictureStore.window = null
  }, [])

  const toggle = useCallback(async () => {
    if (isOpen) close()
    else await open()
  }, [isOpen, close, open])

  return {
    isSupported: IS_PIP_SUPPORTED,
    isOpen,
    open,
    close,
    toggle,
  }
}
