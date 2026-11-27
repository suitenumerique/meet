import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useFullScreen } from '../../../hooks/useFullScreen'
import { Icon } from '@/primitives/Icon'

export const FullScreenMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })
  const { toggleFullScreen, isCurrentlyFullscreen, isFullscreenAvailable } =
    useFullScreen({})

  if (!isFullscreenAvailable) {
    return null
  }

  return (
    <MenuItem
      onAction={() => toggleFullScreen()}
      className={menuRecipe({ icon: true, variant: 'dark' }).item}
    >
      {isCurrentlyFullscreen ? (
        <>
          <Icon name="minimize" size={20} />
          {t('fullscreen.exit')}
        </>
      ) : (
        <>
          <Icon name="maximize" size={20} />
          {t('fullscreen.enter')}
        </>
      )}
    </MenuItem>
  )
}
