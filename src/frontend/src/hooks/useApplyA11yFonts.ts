import { useEffect } from 'react'
import { useSnapshot } from 'valtio'
import { accessibilityStore, UiFont } from '@/stores/accessibility'

const fontImports: Partial<Record<UiFont, () => Promise<unknown>>> = {
  lexend: () => import('@fontsource-variable/lexend'),
  'atkinson-hyperlegible': () =>
    import('@fontsource-variable/atkinson-hyperlegible-next'),
  opendyslexic: () => import('@fontsource/opendyslexic'),
}

const loadedFonts = new Set<UiFont>()

export function useApplyA11yFonts() {
  const { uiFont } = useSnapshot(accessibilityStore)

  useEffect(() => {
    if (uiFont === 'default') {
      return
    }

    const className = `font-${uiFont}`
    const loader = fontImports[uiFont]

    if (loader && !loadedFonts.has(uiFont)) {
      loader().then(() => {
        loadedFonts.add(uiFont)
        document.documentElement.classList.add(className)
      })
    } else {
      document.documentElement.classList.add(className)
    }

    return () => {
      document.documentElement.classList.remove(className)
    }
  }, [uiFont])
}
