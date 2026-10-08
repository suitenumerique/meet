import { Menu as RACMenu, MenuItem } from 'react-aria-components'
import {
  RiContractLeftLine,
  RiExpandRightLine,
  RiMoreFill,
  RiPictureInPictureExitLine,
  RiPictureInPictureLine,
} from '@remixicon/react'
import { useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { Button, Menu } from '@/primitives'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { menuRecipe } from '@/primitives/menuRecipe'
import {
  hideSelfTile,
  layoutStore,
  showSelfTile,
  toggleSelfTileMinimized,
} from '@/stores/layout'
import {
  hasRemoteCamera,
  shouldUseFocusLayout,
} from '@/features/layout/utils/selfTileLayout'

type SelfTileMenuProps = {
  onOpenChange?: (isOpen: boolean) => void
}

export const SelfTileMenu = ({ onOpenChange }: SelfTileMenuProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'participantTileFocus' })
  const announce = useScreenReaderAnnounce()
  const { selfTileLayout, selfTileMinimized } = useSnapshot(layoutStore)
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { updateOnlyOn: [], onlySubscribed: false }
  )

  if (!hasRemoteCamera(cameraTracks)) return null

  const isInCorner = shouldUseFocusLayout(selfTileLayout, cameraTracks)
  const isMinimized = selfTileLayout === 'corner' && selfTileMinimized
  const itemClassName = menuRecipe({ icon: true, variant: 'dark' }).item

  return (
    <Menu variant="dark" placement="top" onOpenChange={onOpenChange}>
      <Button
        size="sm"
        variant="primaryTextDark"
        square
        aria-label={t('moreOptions')}
        tooltip={t('moreOptions')}
      >
        <RiMoreFill />
      </Button>
      <RACMenu style={{ minWidth: '220px' }}>
        {isInCorner && (
          <MenuItem
            className={itemClassName}
            onAction={() => {
              toggleSelfTileMinimized()
              announce(
                isMinimized
                  ? t('announcements.expanded')
                  : t('announcements.reduced')
              )
            }}
          >
            {isMinimized ? (
              <RiExpandRightLine size={20} />
            ) : (
              <RiContractLeftLine size={20} />
            )}
            {isMinimized ? t('expand') : t('reduce')}
          </MenuItem>
        )}
        <MenuItem
          className={itemClassName}
          onAction={() => {
            if (isInCorner) {
              hideSelfTile()
              announce(t('announcements.hidden'))
              return
            }
            showSelfTile()
            announce(t('announcements.shown'))
          }}
        >
          {isInCorner ? (
            <RiPictureInPictureExitLine size={20} />
          ) : (
            <RiPictureInPictureLine size={20} />
          )}
          {isInCorner ? t('hideTile') : t('showTile')}
        </MenuItem>
      </RACMenu>
    </Menu>
  )
}
