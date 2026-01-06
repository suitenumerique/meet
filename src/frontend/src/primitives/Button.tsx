import {
  Button as RACButton,
  type ButtonProps as RACButtonsProps,
} from 'react-aria-components'
import { type RecipeVariantProps } from '@/styled-system/css'
import { buttonRecipe, type ButtonRecipe } from './buttonRecipe'
import { TooltipWrapper, type TooltipWrapperProps } from './TooltipWrapper'
import { ReactNode, forwardRef } from 'react'
import { Loader } from './Loader'

export type ButtonProps = RecipeVariantProps<ButtonRecipe> &
  RACButtonsProps &
  TooltipWrapperProps & {
    // Use tooltip as description below the button.
    description?: boolean
  } & {
    icon?: ReactNode
  }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ tooltip, tooltipType = 'instant', ...props }, ref) => {
    const [variantProps, componentProps] = buttonRecipe.splitVariantProps(props)
    const { className, ...remainingComponentProps } = componentProps

    return (
      <TooltipWrapper tooltip={tooltip} tooltipType={tooltipType}>
        <RACButton
          ref={ref}
          className={[buttonRecipe(variantProps), className].join(' ')}
          {...(remainingComponentProps as RACButtonsProps)}
        >
          {!props.loading && props.icon}
          {props.loading && <Loader />}
          {componentProps.children as ReactNode}
          {props.description && <span>{tooltip}</span>}
        </RACButton>
      </TooltipWrapper>
    )
  }
)
