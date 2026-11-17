import pandaPreset from '@pandacss/preset-panda'
import { defineTokens } from '@pandacss/dev'
import { colors as uiKitColors } from './ui-kit/colors'

/*
 * Our tokens follow the `globals` of the La Suite UI kit and keep its names, so
 * that a spec written with the kit reads the same in our styles: a `brand-550`
 * there is a `brand.550` here, a `spacings/xs` an `xs`.
 *
 * The colors are generated from the kit (see ./ui-kit). The other scales of
 * the kit are short and the same in all its themes: they are written below.
 * Scales the kit does not define (radii, line heights, sizes) are our own.
 */

const colors = defineTokens.colors({
  current: pandaPreset.theme.tokens.colors.current,
  transparent: pandaPreset.theme.tokens.colors.transparent,
  ...uiKitColors,
  // `white` and `black` are translucent scales in the kit (`white.100` is 10%
  // opaque): the bare names are kept for the opaque colors.
  white: { DEFAULT: { value: '#FFFFFF' }, ...uiKitColors.white },
  black: { DEFAULT: { value: '#000000' }, ...uiKitColors.black },
})

const spacing = defineTokens.spacing({
  0: { value: '0rem' },
  '4xs': { value: '0.125rem' },
  '3xs': { value: '0.25rem' },
  '2xs': { value: '0.375rem' },
  xs: { value: '0.5rem' },
  sm: { value: '0.75rem' },
  base: { value: '1rem' },
  md: { value: '1.5rem' },
  lg: { value: '2rem' },
  xl: { value: '2.5rem' },
  '2xl': { value: '3rem' },
  '3xl': { value: '3.5rem' },
  '4xl': { value: '4rem' },
  '5xl': { value: '4.5rem' },
  '6xl': { value: '6rem' },
  '7xl': { value: '7.5rem' },
})

const sizes = defineTokens.sizes({
  0: { value: '0rem' },
  full: { value: '100%' },
  min: { value: 'min-content' },
  max: { value: 'max-content' },
  fit: { value: 'fit-content' },
  // room layout
  'room-side-panel': { value: '360px' },
  'room-side-panel-margin': { value: '1.5rem' },
  'room-control-bar': { value: '80px' },
  'room-reaction-toolbar-height': { value: '42px' },
  'tooltip-spacing': { value: '8px' },
})

/*
 * The kit has no scale for radii. Ours is keyed by pixel size and covers the
 * radii its components use: 2, 4, 8 and 12.
 */
const radii = defineTokens.radii({
  2: { value: '0.125rem' },
  4: { value: '0.25rem' },
  6: { value: '0.375rem' },
  8: { value: '0.5rem' },
  12: { value: '0.75rem' },
  16: { value: '1rem' },
  full: { value: '9999px' },
})

/*
 * The app ships no font of its own: a custom theme brings one by overriding
 * `--fonts-sans` (see docs/theming.md), like Marianne in the DINUM image.
 */
const fonts = defineTokens.fonts({
  sans: {
    value: [
      'ui-sans-serif',
      'system-ui',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      '"Noto Sans"',
      'sans-serif',
      '"Apple Color Emoji"',
      '"Segoe UI Emoji"',
      '"Segoe UI Symbol"',
      '"Noto Color Emoji"',
    ],
  },
  serif: {
    value: [
      'ui-serif',
      'Georgia',
      'Cambria',
      '"Times New Roman"',
      'Times',
      'serif',
    ],
  },
  mono: {
    value: [
      'Source Code Pro',
      'ui-monospace',
      'SFMono-Regular',
      'Menlo',
      'Monaco',
      'Consolas',
      '"Liberation Mono"',
      '"Courier New"',
      'monospace',
    ],
  },
})

const fontSizes = defineTokens.fontSizes({
  t: { value: '0.6875rem' },
  xs: { value: '0.75rem' },
  s: { value: '0.75rem' },
  sm: { value: '0.875rem' },
  ml: { value: '0.938rem' },
  md: { value: '1rem' },
  lg: { value: '1.125rem' },
  xl: { value: '1.25rem' },
  h6: { value: '1.125rem' },
  h5: { value: '1.25rem' },
  h4: { value: '1.375rem' },
  h3: { value: '1.5rem' },
  h2: { value: '1.75rem' },
  h1: { value: '2rem' },
  'xs-alt': { value: '3rem' },
  'sm-alt': { value: '3.5rem' },
  'md-alt': { value: '4rem' },
  'lg-alt': { value: '4.5rem' },
  'xl-alt': { value: '5rem' },
})

/* Mind that `bold` is 600 in the kit, and not the 700 of the CSS keyword. */
const fontWeights = defineTokens.fontWeights({
  thin: { value: '100' },
  light: { value: '300' },
  regular: { value: '400' },
  medium: { value: '500' },
  bold: { value: '600' },
  extrabold: { value: '800' },
  black: { value: '800' },
})

const lineHeights = defineTokens.lineHeights({
  1: { value: '1' },
  1.25: { value: '1.25' },
  1.375: { value: '1.375' },
  1.5: { value: '1.5' },
  1.625: { value: '1.625' },
  2: { value: '2' },
})

const shadows = defineTokens.shadows({
  sm: {
    value: ['0 1px 3px 0 rgb(0 0 0 / 0.1)', '0 1px 2px -1px rgb(0 0 0 / 0.1)'],
  },
})

/* The `transitions` of the kit, which animates with `default` and `out`. */
const durations = defineTokens.durations({
  default: { value: '250ms' },
})

const easings = defineTokens.easings({
  in: { value: 'cubic-bezier(0.32, 0, 0.67, 0)' },
  out: { value: 'cubic-bezier(0.33, 1, 0.68, 1)' },
  'in-out': { value: 'cubic-bezier(0.65, 0, 0.35, 1)' },
})

export const tokens = defineTokens({
  aspectRatios: pandaPreset.theme.tokens.aspectRatios,
  borders: pandaPreset.theme.tokens.borders,
  colors,
  durations,
  easings,
  fonts,
  fontSizes,
  fontWeights,
  lineHeights,
  radii,
  shadows,
  sizes,
  spacing,
})
