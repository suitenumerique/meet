import React from 'react'
type RoomData = {
  slug: string
  url: string
  phone?: string
  code?: string
}

export const VisioCreateButton = ({
  onRoomCreated,
}: {
  onRoomCreated: (roomData: RoomData) => void
}) => {
  return (
    <iframe
      allow="clipboard-read; clipboard-write"
      src={'https://meet.127.0.0.1.nip.io/sdk/create-button'}
      style={{
        width: '100%',
        height: '100px',
        border: 'none',
      }}
    ></iframe>
  )
}
