import { useEffect } from 'react'
import { useSnapshot } from 'valtio'
import {
  accessibilityStore,
  UI_FONT_OVERRIDES,
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
      loader()
        .then(() => loadedFonts.add(uiFont))
        .catch((err) => {
          console.error(
            `[useApplyUiFont] Failed to load font "${uiFont}":`,
            err
          )
        })
    }

    const override = UI_FONT_OVERRIDES[uiFont]
    if (override) {
      document.documentElement.style.setProperty(
        '--app-font-family',
        override
      )
    } else {
      document.documentElement.style.removeProperty('--app-font-family')
    }

    return () => {
      document.documentElement.style.removeProperty('--app-font-family')
    }
  }, [uiFont])
}
