import { styled } from '@/styled-system/jsx'
import { type ReactNode, Fragment } from 'react'

const StyledErrors = styled('div', {
  base: {
    display: 'block',
    textStyle: 'sm',
    color: 'content.semantic.error.secondary',
    marginTop: '4xs',
  },
})

/**
 * Styled list of given errors.
 *
 * Used internally by Fields.
 */
export const FieldErrors = ({
  id,
  errors,
}: {
  id?: string
  errors: ReactNode[]
}) => {
  return (
    <StyledErrors id={id}>
      {errors.map((error, i) => {
        return typeof error === 'string' ? (
          <p key={error}>{error}</p>
        ) : (
          <Fragment key={i}>{error}</Fragment>
        )
      })}
    </StyledErrors>
  )
}
