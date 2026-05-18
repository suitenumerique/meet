import { A, Div, Icon, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { Button as RACButton } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { ReactNode } from 'react'
import { RiAlertFill } from '@remixicon/react'
import { SubPanelId, useSidePanel } from '../hooks/useSidePanel'
import { useRestoreFocus } from '@/hooks/useRestoreFocus'
import {
  useIsRecordingModeEnabled,
  RecordingMode,
  TranscriptSidePanel,
  ScreenRecordingSidePanel,
} from '@/features/recording'
import { useConfig } from '@/api/useConfig'
import { useRoomData } from '@/features/rooms/livekit/hooks/useRoomData'
import { ApiEncryptionMode } from '@/features/rooms/api/ApiRoom'

export interface ToolsButtonProps {
  icon: ReactNode
  title: string
  description: string
  onPress: () => void
  isDisabled?: boolean
}

const ToolButton = ({
  icon,
  title,
  description,
  onPress,
  isDisabled,
}: ToolsButtonProps) => {
  return (
    <RACButton
      isDisabled={isDisabled}
      className={css({
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'start',
        paddingY: '0.5rem',
        paddingX: '0.75rem 1.5rem',
        borderRadius: '30px',
        width: 'full',
        backgroundColor: 'gray.50',
        textAlign: 'start',
        '&[data-hovered]:not([data-disabled])': {
          backgroundColor: 'primary.50',
          cursor: 'pointer',
        },
        '&[data-disabled]': {
          opacity: 0.5,
          cursor: 'not-allowed',
        },
      })}
      onPress={onPress}
    >
      <div
        className={css({
          height: '40px',
          minWidth: '40px',
          borderRadius: '25px',
          marginRight: '0.75rem',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
          background: 'primary.800',
          color: 'white',
        })}
      >
        {icon}
      </div>
      <div>
        <Text
          margin={false}
          as="h2"
          className={css({
            display: 'flex',
            gap: 0.25,
            fontWeight: 'semibold',
          })}
        >
          {title}
        </Text>
        <Text as="p" variant="smNote" wrap="pretty">
          {description}
        </Text>
      </div>
      <div
        className={css({
          marginLeft: 'auto',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        })}
      >
        <Icon type="symbols" name="chevron_forward" />
      </div>
    </RACButton>
  )
}

export const Tools = () => {
  const { data } = useConfig()
  const { openTranscript, openScreenRecording, activeSubPanelId, isToolsOpen } =
    useSidePanel()
  const { t } = useTranslation('rooms', { keyPrefix: 'moreTools' })
  const roomData = useRoomData()
  const isEncrypted = roomData?.encryption_mode === ApiEncryptionMode.BASIC

  // Restore focus to the element that opened the Tools panel
  useRestoreFocus(isToolsOpen, {
    resolveTrigger: (activeEl) => {
      if (activeEl?.tagName === 'DIV') {
        return document.querySelector<HTMLElement>('#room-options-trigger')
      }
      return activeEl
    },
    restoreFocusRaf: true,
    preventScroll: true,
  })

  const isTranscriptEnabled = useIsRecordingModeEnabled(
    RecordingMode.Transcript
  )

  const isScreenRecordingEnabled = useIsRecordingModeEnabled(
    RecordingMode.ScreenRecording
  )

  switch (activeSubPanelId) {
    case SubPanelId.TRANSCRIPT:
      return <TranscriptSidePanel />
    case SubPanelId.SCREEN_RECORDING:
      return <ScreenRecordingSidePanel />
    default:
      break
  }

  return (
    <Div
      display="flex"
      overflowY="scroll"
      padding="0 0.75rem"
      flexGrow={1}
      flexDirection="column"
      alignItems="start"
      gap={0.5}
    >
      <Text
        variant="note"
        wrap="balance"
        className={css({
          textStyle: 'sm',
          paddingX: '0.75rem',
          paddingTop: '0.25rem',
          marginBottom: '1rem',
        })}
      >
        {t('body')}{' '}
        {data?.support?.help_article_more_tools && (
          <A
            href={data.support.help_article_more_tools}
            target="_blank"
            rel="noopener noreferrer"
            externalIcon
            color="note"
            aria-label={t('linkAriaLabel')}
          >
            {t('moreLink')}
          </A>
        )}
      </Text>
      {isEncrypted && (
        <div
          className={css({
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            padding: '0.6rem 0.85rem',
            margin: '0 0.75rem 0.75rem',
            borderRadius: '0.5rem',
            backgroundColor: '#fff7ed',
            border: '1px solid #fed7aa',
            color: '#7c2d12',
          })}
          role="alert"
        >
          <RiAlertFill size={18} color="#b45309" />
          <Text
            variant="sm"
            margin={false}
            className={css({
              color: '#7c2d12',
              fontSize: '0.85rem',
              lineHeight: 1.4,
            })}
          >
            {t('encryptedBlock')}
          </Text>
        </div>
      )}
      {isTranscriptEnabled && (
        <ToolButton
          icon={<Icon type="symbols" name="speech_to_text" />}
          title={t('tools.transcript.title')}
          description={t('tools.transcript.body')}
          onPress={openTranscript}
          isDisabled={isEncrypted}
        />
      )}
      {isScreenRecordingEnabled && (
        <ToolButton
          icon={<Icon type="symbols" name="mode_standby" />}
          title={t('tools.screenRecording.title')}
          description={t('tools.screenRecording.body')}
          onPress={openScreenRecording}
          isDisabled={isEncrypted}
        />
      )}
    </Div>
  )
}
