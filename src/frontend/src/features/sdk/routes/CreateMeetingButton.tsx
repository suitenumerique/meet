import { Button } from '@/primitives/Button'
import { useEffect, useState } from 'react'
import { RiCloseLine, RiFileCopyLine } from '@remixicon/react'
import { Spinner } from '@/primitives/Spinner.tsx'

import { A, P, Text } from '@/primitives'
import { HStack, VStack } from '@/styled-system/jsx'
import { buttonRecipe } from '@/primitives/buttonRecipe.ts'
import { useRoomGenerationCallback } from '@/features/sdk/api/useRoomGenerationCallback.ts'
import { Link } from 'react-aria-components'
import { VisioIcon } from '@/assets/VisioIcon.tsx'
import { calculateCenteredPopupPosition } from '@/features/sdk/utils/calculateCenteredPopupPosition.ts'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'

/**
 * Represents meeting room information
 */
type MeetingRoomData = {
  slug: string
  url: string
  phone?: string
  code?: string
}

export const CreateMeetingButton = () => {
  const { t } = useTranslation('sdk', { keyPrefix: 'createMeeting' })

  const [meetingRoom, setMeetingRoom] = useState<MeetingRoomData>(undefined)
  const [callbackId, setCallbackId] = useState(undefined)
  const [isCreatingMeeting, setIsCreatingMeeting] = useState(false)

  const resetMeetingState = () => {
    setMeetingRoom(undefined)
    setCallbackId(undefined)
    setIsCreatingMeeting(false)
  }

  const { data: roomCacheData } = useRoomGenerationCallback({ callbackId })

  // Process room cache data
  useEffect(() => {
    if (!roomCacheData) return
    if (roomCacheData.slug) {
      setCallbackId(undefined)
      setMeetingRoom({
        slug: roomCacheData.slug,
        url: 'https://meet.127.0.0.1.nip.io/' + roomCacheData.slug,
      })
      setIsCreatingMeeting(false)
    }
  }, [roomCacheData?.slug])

  // Handle messages from popup window
  useEffect(() => {
    const handlePopupMessage = (event) => {
      // Skip messages from untrusted sources
      if (event.data.source !== 'https://meet.127.0.0.1.nip.io/') return

      console.log('Message received from popup:', event.origin, event.data)

      if (event.data.status === 'UNAUTHENTICATED') {
        setCallbackId(event.data.callbackId)
        return
      }

      setMeetingRoom(event.data)
      setIsCreatingMeeting(false)
    }

    window.addEventListener('message', handlePopupMessage)
    return () => window.removeEventListener('message', handlePopupMessage)
  }, [])

  // Open popup window to create meeting
  const openMeetingCreationPopup = async () => {
    const { left, top, width, height } = calculateCenteredPopupPosition(window)
    setIsCreatingMeeting(true)

    const popupWindow = window.open(
      `https://meet.127.0.0.1.nip.io/sdk/create-popup`,
      'meetingCreationWindow',
      `width=${width}, height=${height}, left=${left}, top=${top}, resizable=yes,scrollbars=yes`
    )

    if (popupWindow) {
      popupWindow.focus()
    } else {
      alert(t('popupBlocked'))
      setIsCreatingMeeting(false)
    }
  }

  // Handle clipboard copy action
  const handleCopyLink = () => {
    navigator.clipboard.writeText(meetingRoom.url)
  }

  if (isCreatingMeeting) {
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
      {meetingRoom ? (
        <VStack justify={'start'} alignItems={'start'} gap={0.25}>
          <HStack>
            <Link
              className={buttonRecipe({ size: 'sm' })}
              href={meetingRoom.url}
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
                variant="ternaryText"
                square
                icon={<RiFileCopyLine />}
                tooltip={t('copyLinkTooltip')}
                onPress={handleCopyLink}
              />
              <Button
                variant="ternaryText"
                square
                icon={<RiCloseLine />}
                onPress={resetMeetingState}
                aria-label={t('resetLabel')}
              />
            </HStack>
          </HStack>
          <VStack justify={'start'} alignItems="start" gap={0.25}>
            <Text variant={'smNote'} margin={false} centered={false}>
              {meetingRoom.url.replace('https://', '')}
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
          <Button onPress={openMeetingCreationPopup} size="sm">
            <VisioIcon />
            {t('createButton')}
          </Button>
        </div>
      )}
    </div>
  )
}
