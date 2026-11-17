import { cva, type RecipeVariantProps } from '@/styled-system/css'

const badge = cva({
  base: {
    display: 'inline-block',
    padding: '0.25rem 0.5rem',
    backgroundColor: 'background.semantic.brand.secondary',
    color: 'content.semantic.brand.secondary',
    borderRadius: '6',
  },
  variants: {
    size: {
      sm: {
        textStyle: 'badge',
      },
      normal: {},
    },
  },
  defaultVariants: {
    size: 'normal',
  },
})

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  RecipeVariantProps<typeof badge>

export const Badge = ({ size, ...props }: BadgeProps) => {
  return <span {...props} className={badge({ size })} />
}
