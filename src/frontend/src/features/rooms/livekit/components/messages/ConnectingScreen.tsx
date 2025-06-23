import { css } from '@/styled-system/css'
import * as React from 'react'
import { H } from '@/primitives'
import { useEffect, useState } from 'react'

export const ConnectingScreen = ({ reconnecting }) => {
  const [showConnectingMessage, setShowConnectingMessage] = useState(false)

  // todo - internationalize this
  const value = !reconnecting
    ? 'Connexion en cours …'
    : 'Reconnexion en cours …'

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowConnectingMessage(true)
    }, 500)

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [])

  return (
    <div
      className={css({
        width: '100%',
        height: '100%',
        color: 'white',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      })}
    >
      {showConnectingMessage && <H lvl={2}>{value}</H>}
    </div>
  )
}
