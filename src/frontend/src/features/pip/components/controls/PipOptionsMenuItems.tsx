import { Menu as RACMenu } from 'react-aria-components'
import { PictureInPictureMenuItem } from '@/features/rooms/livekit/components/controls/Options/PictureInPictureMenuItem'

export const PipOptionsMenuItems = () => {
  return (
    <RACMenu
      style={{
        minWidth: '150px',
        width: '300px',
      }}
    >
      <PictureInPictureMenuItem />
    </RACMenu>
  )
}
