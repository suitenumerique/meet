import { ConnectionState, RoomEvent } from 'livekit-client'
import { ConnectingScreen } from '@/features/rooms/livekit/components/messages/ConnectingScreen.tsx'
import { css } from '@/styled-system/css'
import * as React from 'react'
import { useConnectionObserver } from '@/features/rooms/livekit/hooks/useConnectionObserver.ts'
import { useConnectionState, useRoomContext } from '@livekit/components-react'
import { useEffect, useState } from 'react'

export const ConnectionStateWrapper = ({ children }) => {
  console.log('$$ wrapper')

  const [isInitiated, setIsInitiated] = useState(false)

  const room = useRoomContext()

  useConnectionObserver()
  const state = useConnectionState()

  useEffect(() => {
    const handleConnected = () => {
      setIsInitiated(true)
    }

    room.on(RoomEvent.Connected, handleConnected)

    return () => {
      room.on(RoomEvent.Connected, handleConnected)
    }
  }, [room, isInitiated])

  console.log('$$', state, room)

  if (
    state == ConnectionState.Connecting ||
    (state == ConnectionState.SignalReconnecting && !isInitiated) ||
    (state == ConnectionState.Reconnecting && !isInitiated)
  )
    return <ConnectingScreen />

  if (state == ConnectionState.Reconnecting)
    return <ConnectingScreen reconnecting={true} />

  if (state == ConnectionState.Disconnected && !isInitiated)
    return (
      <div
        className={css({
          color: 'white',
        })}
      >
        Error occured while initiating the room
      </div>
    )

  if (state == ConnectionState.Disconnected)
    return (
      <div
        className={css({
          color: 'white',
        })}
      >
        Disconnected
      </div>
    )

  return children
}
