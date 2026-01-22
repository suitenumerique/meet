import { MenuItem } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { RiPictureInPicture2Line } from '@remixicon/react'
import { menuRecipe } from '@/primitives/menuRecipe'
import { useRoomPiP } from '../../../hooks/useRoomPiP'

export const PictureInPictureMenuItem = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'options.items' })
  const { isSupported, isOpen, toggle } = useRoomPiP()

  // Hide the entry when the browser doesn't support Document PiP.
  if (!isSupported) return null

  return (
    <MenuItem
      onAction={toggle}
      className={menuRecipe({ icon: true, variant: 'dark' }).item}
    >
      <RiPictureInPicture2Line size={20} />
      {isOpen ? t('pictureInPicture.exit') : t('pictureInPicture.enter')}
    </MenuItem>
  )
}
