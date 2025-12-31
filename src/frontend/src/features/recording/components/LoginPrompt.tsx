import { H, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { LoginButton } from '@/components/LoginButton'

interface LoginPromptProps {
  heading: string
  body: string
}

export const LoginPrompt = ({ heading, body }: LoginPromptProps) => {
  return (
    <div
      className={css({
        backgroundColor: 'primary.50',
        borderRadius: '5px',
        paddingY: '1rem',
        paddingX: '1rem',
        marginTop: '1rem',
        display: 'flex',
        flexDirection: 'column',
      })}
    >
      <H
        lvl={3}
        className={css({
          display: 'flex',
          alignItems: 'center',
          marginBottom: '0.35rem',
        })}
      >
        {heading}
      </H>
      <Text variant="smNote" wrap="pretty">
        {body}
      </Text>
      <div
        className={css({
          marginTop: '1rem',
        })}
      >
        <LoginButton proConnectHint={false} />
      </div>
    </div>
  )
}
