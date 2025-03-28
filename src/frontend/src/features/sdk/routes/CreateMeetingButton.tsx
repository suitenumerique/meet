import { Button } from '@/primitives/Button'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { HStack, VStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { RiCloseLine, RiFileCopyLine } from '@remixicon/react'
import { Text } from '@/primitives'
import { Spinner } from '@/primitives/Spinner'
import { buttonRecipe } from '@/primitives/buttonRecipe'
import { VisioIcon } from '@/assets/VisioIcon'
import { getRouteUrl } from '@/navigation/getRouteUrl'
import { useRoomCreationCallback } from '../api/useRoomCreationCallback'
import { PopupManager } from '../utils/PopupManager'
import { CallbackCreationRoomData } from '../utils/types'
import { useSearchParams } from 'wouter'

const popupManager = new PopupManager()

export const CreateMeetingButton = () => {
  const { t } = useTranslation('sdk', { keyPrefix: 'createMeeting' })

  const [searchParams] = useSearchParams()

  const [callbackId, setCallbackId] = useState<string | undefined>(undefined)
  const [isPending, setIsPending] = useState(false)

  const initialRoom = useMemo(() => {
    const roomSlug = searchParams.get('slug')
    if (!roomSlug) return undefined
    return {
      slug: roomSlug.trim(), // Trim whitespace for safety
    }
  }, [searchParams])

  const [room, setRoom] = useState<CallbackCreationRoomData | undefined>(
    initialRoom
  )

  const { data } = useRoomCreationCallback({ callbackId })

  const roomUrl = useMemo(() => {
    if (room?.slug) return getRouteUrl('room', room.slug)
  }, [room])

  useEffect(() => {
    if (!data?.room?.slug) return
    setRoom(data.room)
    setCallbackId(undefined)
    setIsPending(false)
  }, [data])

  useEffect(() => {
    popupManager.setupMessageListener(
      (id) => setCallbackId(id),
      (data) => {
        setRoom(data)
        setIsPending(false)
      }
    )

    return () => popupManager.cleanup()
  }, [])

  const resetState = () => {
    setRoom(undefined)
    setCallbackId(undefined)
    setIsPending(false)
  }

  if (isPending) {
    return (
      <div>
        <Spinner />
      </div>
    )
  }

  return (
    <div
      className="p-6"
      style={{
        display: 'flex',
        justifyContent: 'start',
        alignItems: 'start',
        border: 'none',
      }}
    >
      {roomUrl && room?.slug ? (
        <VStack justify={'start'} alignItems={'start'} gap={0.25}>
          <HStack>
            <Link
              className={buttonRecipe({ size: 'sm' })}
              href={roomUrl}
              target="_blank"
              style={{
                textWrap: 'nowrap',
              }}
            >
              <VisioIcon />
              {t('joinButton')}
            </Link>
            <HStack gap={0}>
              <Button
                variant="quaternaryText"
                square
                icon={<RiFileCopyLine />}
                tooltip={t('copyLinkTooltip')}
                onPress={() => {
                  navigator.clipboard.writeText(roomUrl)
                }}
              />
              {searchParams.get('readOnly') === 'false' && (
                <Button
                  variant="quaternaryText"
                  square
                  icon={<RiCloseLine />}
                  onPress={resetState}
                  aria-label={t('resetLabel')}
                />
              )}
            </HStack>
          </HStack>
          <VStack justify={'start'} alignItems="start" gap={0.25}>
            <Text variant={'smNote'} margin={false} centered={false}>
              {roomUrl.replace('https://', '')}
            </Text>
            <Text variant={'smNote'} margin={false} centered={false}>
              {t('participantLimit')}
            </Text>
          </VStack>
        </VStack>
      ) : (
        <div
          className={css({
            minHeight: '46px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          })}
        >
          {/*
           * Using popup for Visio to access session cookies (blocked in iframes).
           * If authenticated: Popup creates room and returns data directly.
           * If not: Popup sends callbackId, redirects to login, then backend
           * associates new room with callbackId after authentication.
           */}
          <Button
            onPress={() => {
              setIsPending(true)
              popupManager.createPopupWindow(() => {
                setIsPending(false)
              })
            }}
            size="sm"
          >
            <VisioIcon />
            {t('createButton')}
          </Button>
        </div>
      )}
    </div>
  )
}
