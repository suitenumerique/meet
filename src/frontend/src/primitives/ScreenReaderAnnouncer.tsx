import { useSnapshot } from 'valtio'
import { screenReaderAnnouncerStore } from '@/stores/screenReaderAnnouncer'

export const ScreenReaderAnnouncer = () => {
  const { announcement } = useSnapshot(screenReaderAnnouncerStore)

  return (
    <div
      key={announcement.id}
      role="status"
      aria-live={announcement.politeness}
      aria-atomic="true"
      className="sr-only"
      data-announce-id={announcement.id}
    >
      {announcement.message}
    </div>
  )
}

