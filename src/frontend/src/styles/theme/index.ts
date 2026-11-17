import pandaPreset from '@pandacss/preset-panda'
import { breakpoints } from './breakpoints'
import { keyframes } from './keyframes'
import { semanticTokens } from './semanticTokens'
import { textStyles } from './textStyles'
import { tokens } from './tokens'

export { conditions } from './conditions'

/**
 * The Panda theme of the app, which follows the La Suite UI kit:
 * https://github.com/suitenumerique/ui-kit
 */
export const theme = {
  breakpoints,
  containerSizes: pandaPreset.theme.containerSizes,
  keyframes,
  tokens,
  semanticTokens,
  textStyles,
}
