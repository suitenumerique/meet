import { A, Div, Icon, Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { Button as RACButton } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { ReactNode } from 'react'
import { SubPanelId, useSidePanel } from '../hooks/useSidePanel'
import { useRestoreFocus } from '@/hooks/useRestoreFocus'
import { useSidePanelRef } from '../hooks/useSidePanelRef'
import { useSidePanelTriggers } from '../hooks/useSidePanelTriggers'
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
  const panelRef = useSidePanelRef()
  const { getTrigger } = useSidePanelTriggers()

  // Restore focus to the element that opened the Tools panel
  // following the same pattern as Chat.
  useRestoreFocus(isToolsOpen, {
    // If the active element is a MenuItem (DIV) that will be unmounted when the menu closes,
    // find the "more options" button ("Plus d'options") that opened the menu
    resolveTrigger: (activeEl) => {
      if (activeEl?.tagName === 'DIV') {
        return getTrigger('options') ?? activeEl
      }
      // For direct button clicks (e.g. "Plus d'outils"), use the active element as is
      return getTrigger('tools') ?? activeEl
    },
    // Focus the first focusable element when the panel opens
    onOpened: () => {
      requestAnimationFrame(() => {
        const panel = panelRef.current
        if (panel) {
          // Find the first ToolButton in the tools list (transcript or screen recording button)
          const toolsList = panel.querySelector<HTMLElement>(
            '[data-attr="tools-list"]'
          )
          if (toolsList) {
            const firstToolButton = toolsList.querySelector<HTMLElement>(
              'button:first-of-type'
            )
            if (firstToolButton) {
              firstToolButton.focus({ preventScroll: true })
            }
          }
        }
      })
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
      data-attr="tools-list"
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
          icon={<Icon type="symbols" name="speech_to_text" />}
          title={t('tools.transcript.title')}
          description={t('tools.transcript.body')}
          onPress={() => openTranscript()}
        />
      )}
      {isScreenRecordingEnabled && (
        <ToolButton
          icon={<Icon type="symbols" name="mode_standby" />}
          title={t('tools.screenRecording.title')}
          description={t('tools.screenRecording.body')}
          onPress={() => openScreenRecording()}
        />
      )}
    </Div>
  )
}
