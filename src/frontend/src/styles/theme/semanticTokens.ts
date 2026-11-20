import { defineSemanticTokens } from '@pandacss/dev'
import { contextuals } from './ui-kit/contextuals'

export const semanticTokens = defineSemanticTokens({
  colors: {
    /*
     * The contextual colors of the La Suite UI kit: `background.*` paints
     * surfaces, `content.*` texts and icons, `border.*` outlines and dividers.
     * They are generated from the kit (see ./ui-kit).
     */
    ...contextuals,
    /*
     * Outline of the element that has the keyboard focus. The kit draws it
     * with its `border.semantic.brand.primary`, whose values are repeated
     * for the theme scopes: an alias would be resolved once at the root, and
     * would not follow them.
     *
     * Our dark surfaces (the room, the dark menus) are not theme scopes yet,
     * so the default value still has to be visible on light and dark alike:
     * brand.500 keeps a 3:1 contrast on both. Once they are scopes, the
     * default can become the light value of the kit.
     */
    focusRing: {
      value: {
        base: '{colors.brand.500}',
        _light: '{colors.brand.550}',
        _dark: '{colors.brand.450}',
      },
    },
  },
  shadows: {
    box: { value: '{shadows.sm}' },
  },
  spacing: {
    boxPadding: {
      DEFAULT: { value: '{spacing.lg}' },
      sm: { value: '{spacing.base}' },
      xs: { value: '{spacing.xs}' },
    },
    boxMargin: {
      xs: { value: '{spacing.xs}' },
      DEFAULT: { value: '{spacing.base}' },
      lg: { value: '{spacing.lg}' },
    },
    paragraph: { value: '{spacing.xs}' },
    heading: { value: '{spacing.base}' },
    gutter: { value: '{spacing.base}' },
    textfield: { value: '{spacing.base}' },
  },
})
