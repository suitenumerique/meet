import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { useConfig } from '@/api/useConfig'
import { useUser } from '@/features/auth/api/useUser'
import { reportError } from '@/features/analytics/telemetry'
import { announceToScreenReader } from '@/stores/screenReaderAnnouncer'
import { supportStore } from '@/stores/support'
import { openSupportWidget } from '../utils/supportWidget'

export const useSupportWidget = () => {
  const { t, i18n } = useTranslation('global', { keyPrefix: 'support' })
  const { data } = useConfig()
  const { user } = useUser()
  const { status } = useSnapshot(supportStore)

  const {
    widget_script_url: scriptUrl,
    widget_api_url: api,
    widget_channel: channel,
  } = data?.support ?? {}
  const isEnabled = !!(scriptUrl && api && channel)

  const open = () => {
    if (!isEnabled) return

    openSupportWidget(scriptUrl, {
      api,
      channel,
      locale: i18n.language,
      email: user?.email,
    }).catch((error) => {
      reportError('support_widget_failure', error)
      announceToScreenReader(t('openError'), 'assertive')
    })
  }

  return {
    isEnabled,
    isPending: status === 'pending',
    open,
  }
}
