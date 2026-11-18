import { A, Div, Icon, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { Button as RACButton } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { ReactNode } from 'react'
import { SubPanelId, useSidePanel } from '../hooks/useSidePanel'
import { useRestoreFocus } from '@/hooks/useRestoreFocus'
import {
  useIsRecordingModeEnabled,
  RecordingMode,
  TranscriptSidePanel,
  ScreenRecordingSidePanel,
} from '@/features/recording'
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
        position: 'relative',
        paddingY: '0.75rem',
        paddingX: '0.75rem',
        borderRadius: '4px',
        width: 'full',
        backgroundColor: 'transparent',
        textAlign: 'start',
        cursor: 'pointer',
        '&[data-hovered], &[data-pressed]': {
          backgroundColor: 'background.semantic.contextual.primary',
        },
        '& + &::before': {
          content: '""',
          position: 'absolute',
          top: '-5px',
          left: 0,
          right: 0,
          borderTop: '1px solid',
          borderColor: 'gray.100',
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
          background: 'brand.550',
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
            gap: '3xs',
            fontWeight: 'bold',
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
        <Icon name="chevron_forward" />
      </div>
    </RACButton>
  )
}

export const Tools = () => {
  const { data } = useConfig()
  const {
    openTranscript,
    openScreenRecording,
    activeSubPanelId,
    isToolsOpen,
    isSidePanelOpen,
  } = useSidePanel()
  const { t } = useTranslation('rooms', { keyPrefix: 'moreTools' })

  // Restore focus to the element that opened the Tools panel
  // following the same pattern as Chat.
  useRestoreFocus(isToolsOpen, {
    // If the active element is a MenuItem (DIV) that will be unmounted when the menu closes,
    // find the "more options" button ("Plus d'options") that opened the menu
    resolveTrigger: (activeEl) => {
      if (activeEl?.tagName === 'DIV') {
        return document.querySelector<HTMLElement>('#room-options-trigger')
      }
      // For direct button clicks (e.g. "Plus d'outils"), use the active element as is
      return activeEl
    },
    restoreFocusRaf: true,
    preventScroll: true,
    shouldRestoreOnClose: () => !isSidePanelOpen,
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
      gap="xs"
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
      <div
        className={css({
          display: 'flex',
          flexDirection: 'column',
          gap: '9px',
          width: 'full',
        })}
      >
        {isTranscriptEnabled && (
          <ToolButton
            icon={<Icon name="speech_to_text" />}
            title={t('tools.transcript.title')}
            description={t('tools.transcript.body')}
            onPress={() => openTranscript()}
          />
        )}
        {isScreenRecordingEnabled && (
          <ToolButton
            icon={<Icon name="mode_standby" />}
            title={t('tools.screenRecording.title')}
            description={t('tools.screenRecording.body')}
            onPress={() => openScreenRecording()}
          />
        )}
      </div>
    </Div>
  )
}
