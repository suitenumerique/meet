import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DialogTrigger } from 'react-aria-components'
import { RiSettings3Line } from '@remixicon/react'
import { Button } from '@/primitives'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const loadSettingsDialog = () => import('./SettingsDialog')
const SettingsDialog = lazy(() =>
  loadSettingsDialog().then((m) => ({ default: m.SettingsDialog }))
)

export const SettingsButton = () => {
  const { t } = useTranslation('settings')
  const [hasOpened, setHasOpened] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  return (
    <DialogTrigger
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (open) setHasOpened(true)
        setIsOpen(open)
      }}
    >
      <Button
        square
        variant="secondaryText"
        aria-label={t('settingsButtonLabel')}
        tooltip={t('settingsButtonLabel')}
        onHoverStart={() => void loadSettingsDialog()}
        onFocus={() => void loadSettingsDialog()}
      >
        <RiSettings3Line />
      </Button>
      {hasOpened && (
        <ErrorBoundary id="settings-dialog" onError={() => setIsOpen(false)}>
          <Suspense fallback={null}>
            <SettingsDialog />
          </Suspense>
        </ErrorBoundary>
      )}
    </DialogTrigger>
  )
}
