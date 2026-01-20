import { useCallback, useMemo, useState } from 'react'
import { RoomPiPContext } from './roomPiPContext'

export const RoomPiPProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const [isOpen, setIsOpen] = useState(false)

  // Feature detection for Document Picture-in-Picture.
  const isSupported =
    typeof window !== 'undefined' && 'documentPictureInPicture' in window

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(
    () => setIsOpen((current) => !current),
    []
  )

  const value = useMemo(
    () => ({
      isSupported,
      isOpen,
      open,
      close,
      toggle,
    }),
    [close, isOpen, isSupported, open, toggle]
  )

  return (
    <RoomPiPContext.Provider value={value}>
      {children}
    </RoomPiPContext.Provider>
  )
}

