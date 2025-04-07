import { A, Div, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { Button as RACButton } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { CRISP_HELP_ARTICLE_MORE_TOOLS } from '@/utils/constants'
import { ReactNode } from 'react'
import { Transcript } from './Transcript'
import { useIsRecordingModeEnabled } from '../hooks/useIsRecordingModeEnabled'
import { RiFileTextFill, RiLiveFill } from '@remixicon/react'
import { SubPanelId, useSidePanel } from '../hooks/useSidePanel'
import { ScreenRecording } from './ScreenRecording'
import { RecordingMode } from '@/features/rooms/api/startRecording'

export interface ToolsButtonProps {
  icon: ReactNode
  title: string
  description: string
  onPress: () => void
}

const ToolButton = ({
  icon,
  title,
  description,
  onPress,
}: ToolsButtonProps) => {
  return (
    <RACButton
      className={css({
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'start',
        paddingY: '0.5rem',
        paddingX: '0.75rem 1.5rem',
        borderRadius: '5px',
        gap: '1.25rem',
        width: 'full',
        textAlign: 'start',
        '&[data-hovered]': {
          backgroundColor: 'primary.50',
          cursor: 'pointer',
        },
      })}
      onPress={onPress}
    >
      <div
        className={css({
          height: '50px',
          minWidth: '50px',
          borderRadius: '25px',
          backgroundColor: 'primary.800',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        })}
      >
        {icon}
      </div>
      <div>
        <Text margin={false} as="h3">
          {title}
        </Text>
        <Text as="p" variant="smNote" wrap="pretty">
          {description}
        </Text>
      </div>
    </RACButton>
  )
}

export const Tools = () => {
  const { openTranscript, openScreenRecording, activeSubPanelId } =
    useSidePanel()
  const { t } = useTranslation('rooms', { keyPrefix: 'moreTools' })
  const isTranscriptEnabled = useIsRecordingModeEnabled(
    RecordingMode.Transcript
  )

  const isScreenRecordingEnabled = useIsRecordingModeEnabled(
    RecordingMode.ScreenRecording
  )

  switch (activeSubPanelId) {
    case SubPanelId.TRANSCRIPT:
      return <Transcript />
    case SubPanelId.SCREEN_RECORDING:
      return <ScreenRecording />
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
    >
      <Text
        variant="note"
        wrap="balance"
        className={css({
          textStyle: 'sm',
          paddingX: '0.75rem',
        })}
        margin="md"
      >
        {t('body')}{' '}
        <A href={CRISP_HELP_ARTICLE_MORE_TOOLS} target="_blank">
          {t('moreLink')}
        </A>
        .
      </Text>
      {isTranscriptEnabled && (
        <ToolButton
          icon={<RiFileTextFill size={24} color="white" />}
          title={t('tools.transcript.title')}
          description={t('tools.transcript.body')}
          onPress={() => openTranscript()}
        />
      )}
      {isScreenRecordingEnabled && (
        <ToolButton
          icon={<RiLiveFill size={24} color="white" />}
          title={t('tools.screenRecording.title')}
          description={t('tools.screenRecording.body')}
          onPress={() => openScreenRecording()}
        />
      )}
    </Div>
  )
}
