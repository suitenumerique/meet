import { useToast } from 'react-aria'
import { useMemo, useRef } from 'react'

import { type ToastProps } from './Toast'
import { useTranslation } from 'react-i18next'
import { RiCheckboxCircleLine } from '@remixicon/react'
import { useUser } from '@/features/auth/api/useUser'
import { RecordingMode } from '@/features/recording'
import { ToastCard } from './ToastCard'

export function ToastRecordingSaving({
  state,
  ...props
}: Readonly<ToastProps>) {
  const { t } = useTranslation('notifications', { keyPrefix: 'recordingSave' })
  const ref = useRef(null)
  const { toastProps, contentProps } = useToast(props, state, ref)

  const { user } = useUser()

  const modeLabel = useMemo(() => {
    const mode = props.toast.content.mode as RecordingMode
    switch (mode) {
      case RecordingMode.Transcript:
        return 'transcript'
      case RecordingMode.ScreenRecording:
        return 'screenRecording'
    }
  }, [props.toast.content])

  return (
    <ToastCard
      {...toastProps}
      ref={ref}
      contentProps={contentProps}
      icon={<RiCheckboxCircleLine />}
    >
      {user?.email ? (
        <span
          dangerouslySetInnerHTML={{
            __html: t(`${modeLabel}.message`, {
              email: user.email,
            }),
          }}
        />
      ) : (
        t(`${modeLabel}.default`)
      )}
    </ToastCard>
  )
}
