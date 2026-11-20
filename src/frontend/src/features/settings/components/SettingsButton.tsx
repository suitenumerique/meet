import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RiSettings3Line } from '@remixicon/react'
import { Button } from '@/primitives'

const loadSettingsDialog = () => import('./SettingsDialog')
const SettingsDialog = lazy(() =>
  loadSettingsDialog().then((m) => ({ default: m.SettingsDialog }))
)

export const SettingsButton = () => {
  const { t } = useTranslation('settings')
  const [hasOpened, setHasOpened] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <Button
        square
        variant="secondaryText"
        aria-label={t('settingsButtonLabel')}
        tooltip={t('settingsButtonLabel')}
        onHoverStart={() => void loadSettingsDialog()}
        onFocus={() => void loadSettingsDialog()}
        onPress={() => {
          setHasOpened(true)
          setIsOpen(true)
        }}
      >
        <RiSettings3Line />
      </Button>
      {hasOpened && (
        <Suspense fallback={null}>
          <SettingsDialog isOpen={isOpen} onOpenChange={setIsOpen} />
        </Suspense>
      )}
    </>
  )
}
