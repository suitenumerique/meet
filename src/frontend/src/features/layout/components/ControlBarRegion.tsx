import { cva, RecipeVariantProps } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'

const controlBarRegion = cva({
  base: {
    display: 'flex',
    alignItems: 'center',
    flex: '1 1 33%',
    justifyContent: 'center',
    gap: '0.65rem',
  },
  variants: {
    mobile: {
      true: {
        justifyContent: 'space-between',
        width: '330px',
      },
    },
  },
  defaultVariants: {
    mobile: false,
  },
})

export type ControlBarRegionProps = React.HTMLAttributes<HTMLDivElement> &
  RecipeVariantProps<typeof controlBarRegion>

export function ControlBarRegion({
  children,
  mobile,
  ...props
}: ControlBarRegionProps) {
  const { t } = useTranslation('rooms')
  return (
    <div
      role="region"
      aria-label={t('controls.region')}
      className={controlBarRegion({ mobile })}
      {...props}
    >
      {children}
    </div>
  )
}
