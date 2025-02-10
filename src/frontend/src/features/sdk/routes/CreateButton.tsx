import { Button } from '@/primitives/Button'
import { useTranslation } from 'react-i18next'
import { usePersistentUserChoices } from '@livekit/components-react'
import { useState } from 'react'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { css } from '@/styled-system/css'
import { RiCheckLine, RiFileCopyLine } from '@remixicon/react'
import { VisioIcon } from '@/assets/VisioIcon'
import { generateRoomId, useCreateRoom } from '../../rooms'
import {
  ClientMessageType,
  SdkReverseClient,
  useEnsureAuth,
} from '../SdkReverseClient'

export const SdkCreateButton = () => {
  const { t } = useTranslation('sdk', { keyPrefix: 'createButton' })
  const [roomUrl, setRoomUrl] = useState<string>()
  const [isLoading, setIsLoading] = useState(false)
  const {
    userChoices: { username },
  } = usePersistentUserChoices()

  const { mutateAsync: createRoom } = useCreateRoom()
  const { ensureAuth } = useEnsureAuth()

  const submitCreateRoom = async () => {
    setIsLoading(true)
    const slug = generateRoomId()
    const data = await createRoom({ slug, username })
    const roomUrlTmp = getRouteUrl('room', data.slug)
    setRoomUrl(roomUrlTmp)
    setIsLoading(false)
    SdkReverseClient.post(ClientMessageType.ROOM_CREATED, {
      url: roomUrlTmp,
    })
  }

  const submit = async () => {
    await ensureAuth()
    submitCreateRoom()
  }

  return (
    <div
      className={css({
        paddingTop: '3px',
        paddingLeft: '3px',
      })}
    >
      {roomUrl ? (
        <RoomUrl roomUrl={roomUrl} />
      ) : (
        <Button
          variant="primaryDark"
          aria-label={t('label')}
          onPress={submit}
          data-attr="sdk-create"
          loading={isLoading}
          icon={<VisioIcon />}
        >
          {t('label')}
        </Button>
      )}
    </div>
  )
}

const RoomUrl = ({ roomUrl }: { roomUrl: string }) => {
  const [isCopied, setIsCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(roomUrl!)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 1000)
  }

  return (
    <div
      className={css({
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      })}
    >
      <span
        className={css({
          color: 'greyscale.600',
        })}
      >
        {roomUrl}
      </span>
      <Button
        variant={isCopied ? 'success' : 'quaternaryText'}
        data-attr="sdk-create-copy"
        onPress={copy}
        square
      >
        {isCopied ? <RiCheckLine /> : <RiFileCopyLine />}
      </Button>
    </div>
  )
}
