import { BackToHome } from '@/components/BackToHome'
import { H } from '@/primitives'
import { Center } from '@/styled-system/jsx'

export const CenteredContent = ({
  title,
  children,
  withBackButton,
}: {
  title?: string
  children?: React.ReactNode
  withBackButton?: boolean
}) => {
  return (
    <>
      {!!title && (
        <Center>
          <H lvl={1}>{title}</H>
        </Center>
      )}
      {children}
      {!!withBackButton && (
        <Center marginTop="lg">
          <BackToHome size="sm" />
        </Center>
      )}
    </>
  )
}
