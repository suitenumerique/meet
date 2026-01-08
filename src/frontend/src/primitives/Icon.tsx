import { cva, RecipeVariantProps } from '@/styled-system/css'
import { ComponentPropsWithoutRef } from 'react'

const iconRecipe = cva({
  base: {
    fontWeight: 'normal',
    fontStyle: 'normal',
    display: 'inline-block',
    lineHeight: 1,
    textTransform: 'none',
    letterSpacing: 'normal',
    wordWrap: 'normal',
    whiteSpace: 'nowrap',
    direction: 'ltr',
  },
  variants: {
    type: {
      icons: {
        fontFamily: 'Material Icons Outlined',
        webkitFontSmoothing: 'antialiased',
        mozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
        fontFeatureSettings: '"liga"',
      },
      symbols: {
        fontFamily: 'Material Symbols Outlined Variable',
      },
    },
    size: {
      sm: {
        fontSize: '18px',
      },
      md: {
        fontSize: '24px',
      },
      lg: {
        fontSize: '32px',
      },
      xl: {
        fontSize: '40px',
      },
    },
  },
  defaultVariants: {
    type: 'icons',
    size: 'md',
  },
})

export type IconRecipeProps = RecipeVariantProps<typeof iconRecipe>

export type IconProps = IconRecipeProps &
  ComponentPropsWithoutRef<'span'> & {
    name: string
  }

export const Icon = ({ name, ...props }: IconProps) => {
  const [variantProps, componentProps] = iconRecipe.splitVariantProps(props)
  const { className, ...remainingComponentProps } = componentProps

  return (
    <span
      translate="no"
      aria-hidden="true"
      className={[iconRecipe(variantProps), className].join(' ')}
      {...remainingComponentProps}
    >
      {name}
    </span>
  )
}
