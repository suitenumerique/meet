import { useMemo } from 'react'
import humanizeDuration from 'humanize-duration'
import i18n from 'i18next'
import { useConfig } from '@/api/useConfig'

export const useHumanizeRecordingMaxDuration = () => {
  const { data } = useConfig()

  return useMemo(() => {
    if (!data?.recording?.max_duration) return

    return humanizeDuration(data?.recording?.max_duration, {
      language: i18n.language,
    })
  }, [data])
}
