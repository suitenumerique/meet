import { A, Div, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { Button as RACButton } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { CRISP_HELP_ARTICLE_MORE_TOOLS } from '@/utils/constants'
import { ReactNode } from 'react'
import { RiFileTextFill, RiLiveFill } from '@remixicon/react'
import { SubPanelId, useSidePanel } from '../hooks/useSidePanel'
import {
  useIsRecordingModeEnabled,
  RecordingMode,
  useHasRecordingAccess,
} from '@/features/recording'
import {
  TranscriptSidePanel,
  ScreenRecordingSidePanel,
} from '@/features/recording'
import { FeatureFlags } from '@/features/analytics/enums'

export interface ToolsButtonProps {
  icon: ReactNode
  title: string
  description: string
  onPress: () => void
  isBetaFeature?: boolean
}

const ToolButton = ({
  icon,
  title,
  description,
  onPress,
  isBetaFeature = false,
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
          isBetaFeature
        />
      )}
      {hasScreenRecordingAccess && (
        <ToolButton
          icon={<RiLiveFill size={24} color="white" />}
          title={t('tools.screenRecording.title')}
          description={t('tools.screenRecording.body')}
          onPress={() => openScreenRecording()}
          isBetaFeature
        />
      )}
    </Div>
  )
}
