import { cva, RecipeVariantProps } from '@/styled-system/css'
import { ComponentPropsWithoutRef, FunctionComponent, SVGProps } from 'react'

// Eagerly import every .svg in the icons folder as a React component.
// Drop a new file in /assets/icons and it's available immediately.
const modules = import.meta.glob<{
  default: FunctionComponent<SVGProps<SVGSVGElement>>
}>('../assets/icons/*.svg', { eager: true, query: '?react', import: 'default' })

// Build the registry: { 'chevron-down': Component, 'check': Component, ... }
// Key = filename without extension.
const icons = Object.fromEntries(
  Object.entries(modules).map(([path, mod]) => {
    const name = path
      .split('/')
      .pop()!
      .replace(/\.svg$/, '')
    return [name, mod as unknown as FunctionComponent<SVGProps<SVGSVGElement>>]
  })
) as Record<string, FunctionComponent<SVGProps<SVGSVGElement>>>

export type IconName = keyof typeof icons

const iconRecipe = cva({
  base: {
    display: 'inline-block',
    flexShrink: 0,
    lineHeight: 1,
    color: 'currentColor',
    fill: 'currentColor',
  },
  variants: {
    size: {
      sm: { width: '18px', height: '18px' },
      md: { width: '24px', height: '24px' },
      lg: { width: '32px', height: '32px' },
      xl: { width: '40px', height: '40px' },
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

export type IconRecipeProps = RecipeVariantProps<typeof iconRecipe>

export type IconProps = IconRecipeProps &
  Omit<ComponentPropsWithoutRef<'svg'>, 'name'> & {
    name: IconName
  }

export const Icon = ({ name, ...props }: IconProps) => {
  const [variantProps, componentProps] = iconRecipe.splitVariantProps(props)
  const { className, ...rest } = componentProps

  const SvgIcon = icons[name]

  if (!SvgIcon) {
    if (import.meta.env.NODE_ENV !== 'production') {
      console.warn(
        `[Icon] Unknown icon name: "${name}". Available: ${Object.keys(icons).join(', ')}`
      )
    }
    return null
  }

  return (
    <SvgIcon
      aria-hidden="true"
      focusable="false"
      className={[iconRecipe(variantProps), className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  )
}
