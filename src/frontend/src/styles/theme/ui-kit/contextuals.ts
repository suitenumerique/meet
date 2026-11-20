/**
 * GENERATED FILE, do not edit by hand.
 *
 * Mirrors the "dsfr" theme of the La Suite UI kit.
 * Source: @gouvfr-lasuite/ui-components@1.5.0
 * To update it, run `npm run theme:sync` (see scripts/sync-ui-kit-tokens.mjs).
 */
import { defineSemanticTokens } from '@pandacss/dev'

/**
 * A token whose color depends on the theme: the light value applies by
 * default, `data-theme` scopes switch it (see ../conditions.ts).
 */
const themed = (light: string, dark: string) => ({
  value: {
    base: `{colors.${light}}`,
    _light: `{colors.${light}}`,
    _dark: `{colors.${dark}}`,
  },
})

/**
 * The contextual tokens of the UI kit, its `contextuals`.
 *
 * They read as `<what is painted>.<family>.<role>.<emphasis>`, for instance
 * `background.semantic.brand.primary` or `content.semantic.neutral.secondary`.
 */
export const contextuals = defineSemanticTokens.colors({
  background: {
    surface: {
      primary: themed('gray.000', 'gray.800'),
      secondary: themed('gray.000', 'gray.850'),
      tertiary: themed('gray.025', 'gray.900'),
    },
    semantic: {
      overlay: {
        primary: themed('black.050', 'white.050'),
        'primary-hover': themed('black.100', 'white.100'),
        'on-surface': themed('white.650', 'black.650'),
        transparent: themed('white.000', 'black.000'),
      },
      contextual: {
        primary: themed('black.050', 'white.050'),
        'primary-hover': themed('black.100', 'white.100'),
      },
      brand: {
        primary: themed('brand.550', 'brand.550'),
        'primary-hover': themed('brand.650', 'brand.650'),
        secondary: themed('brand.100', 'brand.700'),
        'secondary-hover': themed('brand.150', 'brand.750'),
        tertiary: themed('brand.050', 'brand.750'),
        'tertiary-hover': themed('brand.100', 'brand.800'),
      },
      neutral: {
        primary: themed('gray.550', 'gray.550'),
        'primary-hover': themed('gray.650', 'gray.650'),
        secondary: themed('gray.100', 'gray.700'),
        'secondary-hover': themed('gray.150', 'gray.750'),
        tertiary: themed('gray.050', 'gray.750'),
        'tertiary-hover': themed('gray.100', 'gray.800'),
      },
      info: {
        primary: themed('info.550', 'info.550'),
        'primary-hover': themed('info.650', 'info.650'),
        secondary: themed('info.100', 'info.700'),
        'secondary-hover': themed('info.150', 'info.750'),
        tertiary: themed('info.050', 'info.750'),
        'tertiary-hover': themed('info.100', 'info.800'),
      },
      success: {
        primary: themed('success.550', 'success.550'),
        'primary-hover': themed('success.650', 'success.650'),
        secondary: themed('success.100', 'success.700'),
        'secondary-hover': themed('success.150', 'success.750'),
        tertiary: themed('success.050', 'success.750'),
        'tertiary-hover': themed('success.100', 'success.800'),
      },
      warning: {
        primary: themed('warning.550', 'warning.550'),
        'primary-hover': themed('warning.650', 'warning.650'),
        secondary: themed('warning.100', 'warning.700'),
        'secondary-hover': themed('warning.150', 'warning.750'),
        tertiary: themed('warning.050', 'warning.750'),
        'tertiary-hover': themed('warning.100', 'warning.800'),
      },
      error: {
        primary: themed('error.550', 'error.550'),
        'primary-hover': themed('error.650', 'error.650'),
        secondary: themed('error.100', 'error.700'),
        'secondary-hover': themed('error.150', 'error.750'),
        tertiary: themed('error.050', 'error.750'),
        'tertiary-hover': themed('error.100', 'error.800'),
      },
      disabled: {
        primary: themed('gray.100', 'gray.750'),
        secondary: themed('gray.050', 'gray.800'),
      },
    },
    palette: {
      brand: {
        primary: themed('brand.500', 'brand.350'),
        secondary: themed('brand.350', 'brand.450'),
        tertiary: themed('brand.150', 'brand.550'),
      },
      red: {
        primary: themed('red.500', 'red.350'),
        secondary: themed('red.350', 'red.450'),
        tertiary: themed('red.150', 'red.550'),
      },
      orange: {
        primary: themed('orange.500', 'orange.350'),
        secondary: themed('orange.350', 'orange.450'),
        tertiary: themed('orange.150', 'orange.550'),
      },
      brown: {
        primary: themed('brown.500', 'brown.350'),
        secondary: themed('brown.350', 'brown.450'),
        tertiary: themed('brown.150', 'brown.550'),
      },
      yellow: {
        primary: themed('yellow.500', 'yellow.350'),
        secondary: themed('yellow.350', 'yellow.450'),
        tertiary: themed('yellow.150', 'yellow.550'),
      },
      green: {
        primary: themed('green.500', 'green.350'),
        secondary: themed('green.350', 'green.450'),
        tertiary: themed('green.150', 'green.550'),
      },
      'blue-1': {
        primary: themed('blue-1.500', 'blue-1.350'),
        secondary: themed('blue-1.350', 'blue-1.450'),
        tertiary: themed('blue-1.150', 'blue-1.550'),
      },
      'blue-2': {
        primary: themed('blue-2.500', 'blue-2.350'),
        secondary: themed('blue-2.350', 'blue-2.450'),
        tertiary: themed('blue-2.150', 'blue-2.550'),
      },
      purple: {
        primary: themed('purple.500', 'purple.350'),
        secondary: themed('purple.350', 'purple.450'),
        tertiary: themed('purple.150', 'purple.550'),
      },
      pink: {
        primary: themed('pink.500', 'pink.350'),
        secondary: themed('pink.350', 'pink.450'),
        tertiary: themed('pink.150', 'pink.550'),
      },
      gray: {
        primary: themed('gray.500', 'gray.350'),
        secondary: themed('gray.350', 'gray.450'),
        tertiary: themed('gray.150', 'gray.550'),
      },
    },
  },
  content: {
    logo1: themed('logo-1-light', 'logo-1-dark'),
    logo2: themed('logo-2-light', 'logo-2-dark'),
    semantic: {
      contextual: { primary: themed('white.950', 'black.850') },
      overlay: {
        primary: themed('white.950', 'black.850'),
        secondary: themed('white.800', 'black.700'),
      },
      brand: {
        primary: themed('brand.700', 'brand.050'),
        secondary: themed('brand.600', 'brand.100'),
        tertiary: themed('brand.550', 'brand.250'),
        'on-brand': themed('brand.050', 'brand.050'),
      },
      neutral: {
        primary: themed('gray.850', 'gray.050'),
        secondary: themed('gray.600', 'gray.100'),
        tertiary: themed('gray.550', 'gray.250'),
        'on-neutral': themed('gray.050', 'gray.050'),
      },
      info: {
        primary: themed('info.700', 'info.050'),
        secondary: themed('info.600', 'info.100'),
        tertiary: themed('info.550', 'info.250'),
        'on-info': themed('info.050', 'info.050'),
      },
      success: {
        primary: themed('success.700', 'success.050'),
        secondary: themed('success.600', 'success.100'),
        tertiary: themed('success.550', 'success.250'),
        'on-success': themed('success.050', 'success.050'),
      },
      warning: {
        primary: themed('warning.700', 'warning.050'),
        secondary: themed('warning.600', 'warning.100'),
        tertiary: themed('warning.550', 'warning.250'),
        'on-warning': themed('warning.050', 'warning.050'),
      },
      error: {
        primary: themed('error.700', 'error.050'),
        secondary: themed('error.600', 'error.100'),
        tertiary: themed('error.550', 'error.250'),
        'on-error': themed('error.050', 'error.050'),
      },
      disabled: {
        primary: themed('gray.300', 'gray.600'),
        secondary: themed('white.500', 'black.300'),
      },
    },
    palette: {
      brand: { primary: themed('brand.500', 'brand.500') },
      red: { primary: themed('red.500', 'red.500') },
      orange: { primary: themed('orange.500', 'orange.500') },
      brown: { primary: themed('brown.500', 'brown.500') },
      yellow: { primary: themed('yellow.500', 'yellow.500') },
      green: { primary: themed('green.500', 'green.500') },
      'blue-1': { primary: themed('blue-1.500', 'blue-1.500') },
      'blue-2': { primary: themed('blue-2.500', 'blue-2.500') },
      purple: { primary: themed('purple.500', 'purple.500') },
      pink: { primary: themed('pink.500', 'pink.500') },
      gray: { primary: themed('gray.500', 'gray.500') },
    },
  },
  border: {
    surface: { primary: themed('gray.100', 'gray.750') },
    semantic: {
      contextual: { primary: themed('white.200', 'black.200') },
      overlay: { primary: themed('white.200', 'black.200') },
      brand: {
        primary: themed('brand.550', 'brand.450'),
        secondary: themed('brand.300', 'brand.600'),
        tertiary: themed('brand.150', 'brand.700'),
      },
      neutral: {
        primary: themed('gray.550', 'gray.450'),
        secondary: themed('gray.300', 'gray.600'),
        tertiary: themed('gray.150', 'gray.700'),
      },
      info: {
        primary: themed('info.550', 'info.450'),
        secondary: themed('info.300', 'info.600'),
        tertiary: themed('info.150', 'info.700'),
      },
      success: {
        primary: themed('success.550', 'success.450'),
        secondary: themed('success.300', 'success.600'),
        tertiary: themed('success.150', 'success.700'),
      },
      warning: {
        primary: themed('warning.550', 'warning.450'),
        secondary: themed('warning.300', 'warning.600'),
        tertiary: themed('warning.150', 'warning.700'),
      },
      error: {
        primary: themed('error.550', 'error.450'),
        secondary: themed('error.300', 'error.600'),
        tertiary: themed('error.150', 'error.700'),
      },
      disabled: { primary: themed('gray.100', 'gray.800') },
    },
  },
})
