import { defineConfig } from '@pandacss/dev'
import { conditions, theme } from './src/styles/theme'

export default defineConfig({
  preflight: true,
  include: ['./src/**/*.{js,jsx,ts,tsx}'],
  exclude: [],
  jsxFramework: 'react',
  outdir: 'src/styled-system',
  globalFontface: {},
  // The document font follows the `sans` token on every page: this is the
  // variable custom themes and the accessibility fonts override.
  globalVars: {
    '--global-font-body': 'var(--fonts-sans)',
    // Height of the settings dialogs, when the viewport is tall enough.
    '--settings-dialog-max-height': '41.625rem',
    // Angle a flipped chevron comes back from, see `chevronFlip`.
    '--chevron-flip-angle': {
      syntax: '<angle>',
      inherits: false,
      initialValue: '0deg',
    },
  },
  conditions,
  theme,
})
