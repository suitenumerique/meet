import { A, Div, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { Button as RACButton } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { ReactNode } from 'react'
import { RiFileTextFill, RiLiveFill } from '@remixicon/react'
import { SubPanelId, useSidePanel } from '../hooks/useSidePanel'
import {
  useIsRecordingModeEnabled,
  RecordingMode,
  useHasRecordingAccess,
  TranscriptSidePanel,
  ScreenRecordingSidePanel,
  useIsRecordingActive,
} from '@/features/recording'
import { FeatureFlags } from '@/features/analytics/enums'
import { useConfig } from '@/api/useConfig'

export interface ToolsButtonProps {
  icon: ReactNode
  title: string
  description: string
  onPress: () => void
  isBetaFeature?: boolean
  isActive?: boolean
}

const ToolButton = ({
  icon,
  title,
  description,
  onPress,
  isBetaFeature = false,
  isActive = false,
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
          position: 'relative',
        })}
      >
        {icon}
        {isBetaFeature && (
          <div
            className={css({
              position: 'absolute',
              backgroundColor: 'primary.50',
              color: 'primary.800',
              fontSize: '12px',
              fontWeight: 500,
              borderRadius: '4px',
              paddingX: '4px',
              paddingBottom: '1px',
              bottom: -8,
              right: -8,
            })}
          >
            BETA
          </div>
        )}
      </div>
      <div>
        <Text
          margin={false}
          as="h3"
          className={css({ display: 'flex', gap: 0.25 })}
        >
          {title}
          {isActive && (
            <div
              className={css({
                backgroundColor: 'primary.500',
                height: '10px',
                width: '10px',
                marginTop: '5px',
                borderRadius: '100%',
              })}
            />
          )}
        </Text>
        <Text as="p" variant="smNote" wrap="pretty">
          {description}
        </Text>
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

  const isTranscriptActive = useIsRecordingActive(RecordingMode.Transcript)

  const hasScreenRecordingAccess = useHasRecordingAccess(
    RecordingMode.ScreenRecording,
    FeatureFlags.ScreenRecording
  )

  const isScreenRecordingActive = useIsRecordingActive(
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
          icon={<RiFileTextFill size={24} color="white" />}
          title={t('tools.transcript.title')}
          description={t('tools.transcript.body')}
          onPress={() => openTranscript()}
          isBetaFeature
          isActive={isTranscriptActive}
        />
      )}
      {hasScreenRecordingAccess && (
        <ToolButton
          icon={<RiLiveFill size={24} color="white" />}
          title={t('tools.screenRecording.title')}
          description={t('tools.screenRecording.body')}
          onPress={() => openScreenRecording()}
          isBetaFeature
          isActive={isScreenRecordingActive}
        />
      )}
    </Div>
  )
}
