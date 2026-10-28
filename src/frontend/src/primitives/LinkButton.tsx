import { Link, LinkProps } from 'react-aria-components'
import { cx, type RecipeVariantProps } from '@/styled-system/css'
import { buttonRecipe, type ButtonRecipe } from './buttonRecipe'
import { TooltipWrapper, type TooltipWrapperProps } from './TooltipWrapper'
import { ReactNode } from 'react'

type LinkButtonProps = RecipeVariantProps<ButtonRecipe> &
  Omit<LinkProps, 'className'> &
  TooltipWrapperProps & {
    // Merged with the recipe classes, so a render function is not supported
    className?: string
    // Use tooltip as description below the button.
    description?: boolean
    target?: string
  }

export const LinkButton = ({
  tooltip,
  tooltipType = 'instant',
  ...props
}: LinkButtonProps) => {
  const [variantProps, componentProps] = buttonRecipe.splitVariantProps(props)
  const { className, ...remainingComponentProps } = componentProps

  return (
    <TooltipWrapper tooltip={tooltip} tooltipType={tooltipType}>
      <Link
        className={cx(buttonRecipe(variantProps), className)}
        {...remainingComponentProps}
      >
        <>
          {componentProps.children as ReactNode}
          {props.description && <span>{tooltip}</span>}
        </>
      </Link>
    </TooltipWrapper>
  )
}
