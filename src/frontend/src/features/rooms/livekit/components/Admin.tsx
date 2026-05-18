import { Div, Field, H, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { Separator as RACSeparator } from 'react-aria-components'
import { RiAlertFill } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { usePatchRoom } from '@/features/rooms/api/patchRoom'
import { ApiAccessLevel, ApiEncryptionMode } from '@/features/rooms/api/ApiRoom'
import { queryClient } from '@/api/queryClient'
import { keys } from '@/api/queryKeys'
import { useParams } from 'wouter'
import { usePublishSourcesManager } from '@/features/rooms/livekit/hooks/usePublishSourcesManager'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'

export const Admin = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'admin' })

  const { roomId } = useParams()

  if (!roomId) {
    throw new Error()
  }

  const { mutateAsync: patchRoom } = usePatchRoom()

  const readOnlyData = useRoomData()

  const {
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
  } = usePublishSourcesManager()

  return (
    <Div
      display="flex"
      overflowY="scroll"
      padding="0 1.5rem"
      flexGrow={1}
      flexDirection="column"
      alignItems="start"
    >
      <Text
        variant="note"
        wrap="pretty"
        className={css({
          textStyle: 'sm',
        })}
        margin={'md'}
      >
        {t('description')}
      </Text>
      <div
        className={css({
          display: 'flex',
          flexDirection: 'column',
        })}
      >
        <RACSeparator
          className={css({
            border: 'none',
            height: '1px',
            width: '100%',
            background: 'greyscale.250',
          })}
        />
        <H
          lvl={2}
          className={css({
            fontWeight: 500,
          })}
          margin="sm"
        >
          {t('moderation.title')}
        </H>
        <Text
          variant="note"
          wrap="balance"
          className={css({
            textStyle: 'sm',
          })}
          margin={'md'}
        >
          {t('moderation.description')}
        </Text>
        <div
          className={css({
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          })}
        >
          <Field
            type="switch"
            label={t('moderation.microphone.label')}
            description={t('moderation.microphone.description')}
            isSelected={isMicrophoneEnabled}
            onChange={toggleMicrophone}
            wrapperProps={{
              noMargin: true,
              fullWidth: true,
            }}
          />
          <Field
            type="switch"
            label={t('moderation.camera.label')}
            description={t('moderation.camera.description')}
            isSelected={isCameraEnabled}
            onChange={toggleCamera}
            wrapperProps={{
              noMargin: true,
              fullWidth: true,
            }}
          />
          <Field
            type="switch"
            label={t('moderation.screenshare.label')}
            description={t('moderation.screenshare.description')}
            isSelected={isScreenShareEnabled}
            onChange={toggleScreenShare}
            wrapperProps={{
              noMargin: true,
              fullWidth: true,
            }}
          />
        </div>
      </div>
      <div
        className={css({
          display: 'flex',
          flexDirection: 'column',
          marginTop: '1rem',
        })}
      >
        <RACSeparator
          className={css({
            border: 'none',
            height: '1px',
            width: '100%',
            background: 'greyscale.250',
          })}
        />
        <H
          lvl={2}
          className={css({
            fontWeight: 500,
          })}
          margin="sm"
        >
          {t('access.title')}
        </H>
        <Text
          variant="note"
          wrap="balance"
          className={css({
            textStyle: 'sm',
          })}
          margin={'md'}
        >
          {t('access.description')}
        </Text>
        {(() => {
          const isEncrypted =
            readOnlyData?.encryption_mode === ApiEncryptionMode.BASIC
          return (
            <>
              {isEncrypted && (
                <div
                  role="alert"
                  className={css({
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center',
                    padding: '0.6rem 0.85rem',
                    marginBottom: '0.75rem',
                    borderRadius: '0.5rem',
                    backgroundColor: '#fff7ed',
                    border: '1px solid #fed7aa',
                    color: '#7c2d12',
                  })}
                >
                  <RiAlertFill
                    size={18}
                    color="#b45309"
                    className={css({ flexShrink: 0 })}
                  />
                  <Text
                    margin={false}
                    className={css({
                      color: '#7c2d12',
                      fontSize: '0.85rem',
                      lineHeight: 1.4,
                    })}
                  >
                    {t('access.encryptedLocked')}
                  </Text>
                </div>
              )}
              <div
                className={css({
                  opacity: isEncrypted ? 0.7 : 1,
                  pointerEvents: isEncrypted ? 'none' : undefined,
                  transition: 'opacity 200ms ease',
                })}
                aria-disabled={isEncrypted || undefined}
              >
                <Field
                  type="radioGroup"
                  label={t('access.type')}
                  aria-label={t('access.type')}
                  labelProps={{
                    className: css({
                      fontSize: '1rem',
                      paddingBottom: '1rem',
                    }),
                  }}
                  isDisabled={isEncrypted}
                  value={
                    isEncrypted
                      ? ApiAccessLevel.RESTRICTED
                      : readOnlyData?.access_level
                  }
                  onChange={(value) =>
                    patchRoom({
                      roomId,
                      room: { access_level: value as ApiAccessLevel },
                    })
                      .then((room) => {
                        queryClient.setQueryData([keys.room, roomId], room)
                      })
                      .catch((e) => console.error(e))
                  }
                  items={[
                    {
                      value: ApiAccessLevel.PUBLIC,
                      label: t('access.levels.public.label'),
                      description: t('access.levels.public.description'),
                    },
                    {
                      value: ApiAccessLevel.TRUSTED,
                      label: t('access.levels.trusted.label'),
                      description: t('access.levels.trusted.description'),
                    },
                    {
                      value: ApiAccessLevel.RESTRICTED,
                      label: t('access.levels.restricted.label'),
                      description: t('access.levels.restricted.description'),
                    },
                  ]}
                />
              </div>
            </>
          )
        })()}
      </div>
    </Div>
  )
}
