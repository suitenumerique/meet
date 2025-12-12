import { A, Div, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { Button as RACButton } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { ReactNode } from 'react'
import { SubPanelId, useSidePanel } from '../hooks/useSidePanel'
import {
  useIsRecordingModeEnabled,
  RecordingMode,
  useHasRecordingAccess,
  TranscriptSidePanel,
  ScreenRecordingSidePanel,
} from '@/features/recording'
import { FeatureFlags } from '@/features/analytics/enums'
import { useConfig } from '@/api/useConfig'

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
        borderRadius: '30px',
        width: 'full',
        backgroundColor: 'gray.50',
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
          as="h3"
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
        <span className="material-symbols">chevron_forward</span>
      </div>
    </RACButton>
  )
}

export const Tools = () => {
  const { data } = useConfig()
  const { openTranscript, openScreenRecording, activeSubPanelId } =
    useSidePanel()
  const { t } = useTranslation('rooms', { keyPrefix: 'moreTools' })

  const isTranscriptEnabled = useIsRecordingModeEnabled(
    RecordingMode.Transcript
  )

  const hasScreenRecordingAccess = useHasRecordingAccess(
    RecordingMode.ScreenRecording,
    FeatureFlags.ScreenRecording
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
          marginBottom: '1rem',
        })}
      >
        {t('body')}{' '}
        {data?.support?.help_article_more_tools && (
          <>
            <A href={data?.support?.help_article_more_tools} target="_blank">
              {t('moreLink')}
            </A>
            .
          </>
        )}
      </Text>
      {isTranscriptEnabled && (
        <ToolButton
          icon={<span className="material-symbols">speech_to_text</span>}
          title={t('tools.transcript.title')}
          description={t('tools.transcript.body')}
          onPress={() => openTranscript()}
        />
      )}
      {hasScreenRecordingAccess && (
        <ToolButton
          icon={<span className="material-symbols">mode_standby</span>}
          title={t('tools.screenRecording.title')}
          description={t('tools.screenRecording.body')}
          onPress={() => openScreenRecording()}
        />
      )}
    </Div>
  )
}
