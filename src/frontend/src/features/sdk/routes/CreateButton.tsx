import { Button } from '@/primitives/Button'
import { useTranslation } from 'react-i18next'
import { usePersistentUserChoices } from '@livekit/components-react'
import { useEffect, useState } from 'react'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { css } from '@/styled-system/css'
import { RiCheckLine, RiFileCopyLine } from '@remixicon/react'
import { generateRoomId, useCreateRoom } from '../../rooms'
import { authUrl, useUser } from '@/features/auth'
import { Spinner } from '@/primitives/Spinner.tsx'

import { useParams } from 'wouter'

export const SdkCreateButton = () => {
  const { t } = useTranslation('sdk', { keyPrefix: 'createButton' })

  const [roomUrl, setRoomUrl] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)

  const [wPopup, setWPopup] = useState()

  const {
    userChoices: { username },
  } = usePersistentUserChoices()

  const { mutateAsync: createRoom } = useCreateRoom()
  // const { ensureAuth } = useEnsureAuth()

  const { isLoggedIn } = useUser({ refetchInterval: 1000 })

  useEffect(() => {
    if (wPopup?.closed) {
      window.location.reload()
    }
  }, [wPopup])

  useEffect(() => {
    if (window.location.search == '?auth=success') {
      window.close()
    }
  }, [window.location.search])

  if (isLoggedIn === false && !wPopup) {
    const popup = window.open(
      authUrl({ returnTo: '/sdk/create-button?auth=success' }), // Path to your popup HTML page
      'wip',
      `popup=true, width=550, height=550, left=614, top=267, resizable=yes,scrollbars=yes`
    )
    setWPopup(popup)
  }

  const submitCreateRoom = async () => {
    setIsLoading(true)
    const slug = generateRoomId()
    const data = await createRoom({ slug, username })
    const roomUrlTmp = getRouteUrl('room', data.slug)
    setRoomUrl(roomUrlTmp)
    setIsLoading(false)
    // SdkReverseClient.post(ClientMessageType.ROOM_CREATED, {
    //   url: roomUrlTmp,
    // })

    console.log('$$roomUrlTmp', roomUrlTmp)
    sendMessageToParent(roomUrlTmp, slug)
  }

  const sendMessageToParent = (roomUrlTmp, slug) => {
    console.log('$$', window.opener)
    const phone = '00000000000'
    const code = '123456789'

    if (window.opener) {
      window.opener.postMessage(
        {
          source: 'https://meet.127.0.0.1.nip.io/',
          url: roomUrlTmp,
          slug,
          phone,
          code,
        },
        '*'
      )
      window.close()
    }
  }

  console.log(isLoggedIn)

  useEffect(() => {
    if (isLoggedIn) {
      submitCreateRoom()
    }
  }, [isLoggedIn])

  return (
    <div
      className={css({
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
      })}
    >
      <Spinner />
    </div>
  )
}
