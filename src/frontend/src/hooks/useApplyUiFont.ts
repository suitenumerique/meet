import { useEffect } from 'react'
import { useSnapshot } from 'valtio'
import {
  accessibilityStore,
  UI_FONT_STACKS,
  UiFont,
} from '@/stores/accessibility'

const fontImports: Partial<Record<UiFont, () => Promise<unknown>>> = {
  lexend: () => import('@fontsource-variable/lexend'),
  'atkinson-hyperlegible': () =>
    import('@fontsource-variable/atkinson-hyperlegible-next'),
  opendyslexic: () => import('@fontsource/opendyslexic'),
}

const loadedFonts = new Set<UiFont>()

export function useApplyUiFont() {
  const { uiFont } = useSnapshot(accessibilityStore)

  useEffect(() => {
    const loader = fontImports[uiFont]
    if (loader && !loadedFonts.has(uiFont)) {
      loader().then(() => loadedFonts.add(uiFont))
    }

    document.documentElement.style.setProperty(
      '--app-font-family',
      UI_FONT_STACKS[uiFont]
    )

    return () => {
      document.documentElement.style.removeProperty('--app-font-family')
    }
  }, [uiFont])
}
