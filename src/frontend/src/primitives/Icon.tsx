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

export type IconProps = Omit<NonNullable<IconRecipeProps>, 'size'> &
  Omit<ComponentPropsWithoutRef<'svg'>, 'name'> & {
    name: IconName
    /** One of the sizes of the recipe, or a size in pixels. */
    size?: NonNullable<IconRecipeProps>['size'] | number
  }

export const Icon = ({ name, size, className, style, ...rest }: IconProps) => {
  const SvgIcon = icons[name]

  if (!SvgIcon) {
    if (import.meta.env.NODE_ENV !== 'production') {
      console.warn(
        `[Icon] Unknown icon name: "${name}". Available: ${Object.keys(icons).join(', ')}`
      )
    }
    return null
  }

  const pixels = typeof size === 'number' ? size : undefined

  return (
    <SvgIcon
      aria-hidden="true"
      focusable="false"
      className={[
        iconRecipe({
          size: pixels === undefined ? (size as never) : undefined,
        }),
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        pixels === undefined
          ? style
          : { width: pixels, height: pixels, ...style }
      }
      {...rest}
    />
  )
}
