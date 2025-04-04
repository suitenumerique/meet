import { Link, LinkProps } from 'react-aria-components'
import { type RecipeVariantProps } from '@/styled-system/css'
import { buttonRecipe, type ButtonRecipe } from './buttonRecipe'
import { TooltipWrapper, type TooltipWrapperProps } from './TooltipWrapper'
import { ReactNode } from 'react'

type LinkButtonProps = RecipeVariantProps<ButtonRecipe> &
  LinkProps &
  TooltipWrapperProps & {
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

  return (
    <TooltipWrapper tooltip={tooltip} tooltipType={tooltipType}>
      <Link className={buttonRecipe(variantProps)} {...componentProps}>
        <>
          {componentProps.children as ReactNode}
          {props.description && <span>{tooltip}</span>}
        </>
      </Link>
    </TooltipWrapper>
  )
}
