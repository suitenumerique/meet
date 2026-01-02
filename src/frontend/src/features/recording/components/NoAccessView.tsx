import { A, Div, H, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { LoginPrompt } from './LoginPrompt'
import { RequestRecording } from './RequestRecording'
import { useUser } from '@/features/auth'
import { HStack, VStack } from '@/styled-system/jsx'

const Divider = ({ label }: { label: string }) => (
  <HStack gap="1rem" alignItems="center" width="100%" marginY="1rem">
    <div className={css({ flex: 1, height: '1px', bg: 'neutral.200' })} />
    <Text variant="xsNote">{label}</Text>
    <div className={css({ flex: 1, height: '1px', bg: 'neutral.200' })} />
  </HStack>
)

interface NoAccessViewProps {
  i18nKeyPrefix: string
  i18nKey: string
  helpArticle?: string
  imagePath: string
  handleRequest: () => Promise<void>
  isActive: boolean
}

export const NoAccessView = ({
  i18nKeyPrefix,
  i18nKey,
  helpArticle,
  imagePath,
  handleRequest,
  isActive,
}: NoAccessViewProps) => {
  const { isLoggedIn } = useUser()
  const { t } = useTranslation('rooms', { keyPrefix: i18nKeyPrefix })

  return (
    <Div
      display="flex"
      overflowY="scroll"
      padding="0 1.5rem"
      flexGrow={1}
      flexDirection="column"
      alignItems="center"
    >
      <img
        src={imagePath}
        alt=""
        className={css({
          minHeight: '250px',
          height: '250px',
          marginBottom: '1rem',
          marginTop: '-16px',
          '@media (max-height: 900px)': {
            height: 'auto',
            minHeight: 'auto',
            maxHeight: '25%',
            marginBottom: '0.75rem',
          },
          '@media (max-height: 770px)': {
            display: 'none',
          },
        })}
      />
      <VStack gap={0} marginBottom={0}>
        <H lvl={1} margin={'sm'} fullWidth centered>
          {t(`${i18nKey}.heading`)}
        </H>
        <Text
          variant="note"
          centered
          className={css({
            textStyle: 'sm',
            marginBottom: '2.5rem',
            marginTop: '0.25rem',
            '@media (max-height: 700px)': {
              marginBottom: '1rem',
            },
          })}
        >
          {t(`${i18nKey}.body`)}
          <br />
          {helpArticle && (
            <A href={helpArticle} target="_blank">
              {t(`${i18nKey}.linkMore`)}
            </A>
          )}
        </Text>
      </VStack>
      {!isLoggedIn && (
        <LoginPrompt
          heading={t(`${i18nKey}.login.heading`)}
          body={t(`${i18nKey}.login.body`)}
        />
      )}
      {!isLoggedIn && !isActive && (
        <Divider label={t(`${i18nKey}.dividerLabel`)} />
      )}
      {!isActive && (
        <RequestRecording
          heading={t(`${i18nKey}.request.heading`)}
          body={t(`${i18nKey}.request.body`)}
          buttonLabel={t(`${i18nKey}.request.buttonLabel`)}
          handleRequest={handleRequest}
        />
      )}
    </Div>
  )
}
