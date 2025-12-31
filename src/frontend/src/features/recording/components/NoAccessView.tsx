import { A, Div, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { LoginPrompt } from './LoginPrompt'
import { useUser } from '@/features/auth'

interface NoAccessViewProps {
  i18nKeyPrefix: string
  i18nKey: string
  helpArticle?: string
  imagePath: string
}

export const NoAccessView = ({
  i18nKeyPrefix,
  i18nKey,
  helpArticle,
  imagePath,
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
          minHeight: '309px',
          height: '309px',
          marginBottom: '1rem',
          '@media (max-height: 700px)': {
            height: 'auto',
            minHeight: 'auto',
            maxHeight: '45%',
            marginBottom: '0.3rem',
          },
          '@media (max-height: 530px)': {
            height: 'auto',
            minHeight: 'auto',
            maxHeight: '40%',
            marginBottom: '0.1rem',
          },
        })}
      />
      <Text>{t(`${i18nKey}.heading`)}</Text>
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
      {!isLoggedIn && (
        <LoginPrompt
          heading={t(`${i18nKey}.login.heading`)}
          body={t(`${i18nKey}.login.body`)}
        />
      )}
    </Div>
  )
}
