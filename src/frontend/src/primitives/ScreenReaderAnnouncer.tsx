import { useSnapshot } from 'valtio'
import {
  screenReaderAnnouncerStore,
  type ScreenReaderChannel,
} from '@/stores/screenReaderAnnouncer'

export const ScreenReaderAnnouncer = ({
  channel = 'global',
}: {
  channel?: ScreenReaderChannel
}) => {
  const { announcements } = useSnapshot(screenReaderAnnouncerStore)
  const announcement = announcements[channel]

  if (!announcement) return null

  return (
    <div
      role="status"
      aria-live={announcement.politeness}
      aria-atomic="true"
      className="sr-only"
      data-announce-id={announcement.id}
      data-announce-channel={channel}
    >
      {announcement.message}
    </div>
  )
}
