import { useTranslation } from 'react-i18next'

import { A, Text } from '@/primitives'
import { useConfig } from '@/api/useConfig'
import { useHumanizeDuration } from '@/hooks/useHumanizeDuration'
import { useMemo } from 'react'

export const LimitDescription = ({
  keyPrefix,
  supportArticleLink,
}: {
  keyPrefix?: 'transcript' | 'screenRecording'
  supportArticleLink?: string
}) => {
  const { data } = useConfig()
  const { t } = useTranslation('rooms', { keyPrefix })

  const formatter = useHumanizeDuration()

  const maxRecordingDuration = useMemo(
    () => formatter(data?.recording?.max_duration),
    [data?.recording?.max_duration, formatter]
  )

  return (
    <Text variant="body" fullWidth>
      {maxRecordingDuration
        ? t('body', { max_duration: maxRecordingDuration })
        : t('bodyWithoutMaxDuration')}{' '}
      {supportArticleLink && (
        <A
          href={supportArticleLink}
          target="_blank"
          rel="noopener noreferrer"
          externalIcon
          aria-label={t('linkAriaLabel')}
        >
          {t('linkMore')}
        </A>
      )}
    </Text>
  )
}
