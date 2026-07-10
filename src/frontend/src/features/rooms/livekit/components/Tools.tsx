import { A, Div, Icon, Text } from '@/primitives'
import { Spinner } from '@/primitives/Spinner'
import { css } from '@/styled-system/css'
import { Center } from '@/styled-system/jsx'
import { Button as RACButton } from 'react-aria-components'
import { useTranslation } from 'react-i18next'
import { ReactNode, Suspense } from 'react'
import { useSidePanel } from '../hooks/useSidePanel'
import { useRestoreFocus } from '@/hooks/useRestoreFocus'
import { useConfig } from '@/api/useConfig'
import {
  PanelErrorBoundary,
  getVisibleToolPlugins,
  useRegistryVersion,
  type Plugin,
} from '@/features/plugins'

export interface ToolsButtonProps {
  icon: ReactNode
  title: string
  description: string
  onPress: () => void
  dataAttr?: string
}

const ToolButton = ({
  icon,
  title,
  description,
  onPress,
  dataAttr,
}: ToolsButtonProps) => {
  return (
    <RACButton
      data-attr={dataAttr}
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
        <Icon name="chevron_forward" />
      </div>
    </RACButton>
  )
}

/** Renders one registry plugin as a Tools menu entry, translated in its ns. */
const PluginToolButton = ({
  plugin,
  onPress,
}: {
  plugin: Plugin
  onPress: () => void
}) => {
  const { t } = useTranslation(plugin.i18nNamespace)
  return (
    <ToolButton
      icon={plugin.contributes.tool?.icon}
      title={t(plugin.contributes.tool?.titleKey ?? 'tool.title')}
      description={t(plugin.contributes.tool?.descriptionKey ?? 'tool.body')}
      onPress={onPress}
      dataAttr={`tool-${plugin.id.replace(/\./g, '-')}`}
    />
  )
}

/** Suspense fallback while a lazy plugin panel is loading. */
const PanelFallback = () => (
  <Center flexGrow={1} padding="2rem">
    <Spinner />
  </Center>
)

export const Tools = () => {
  const { data } = useConfig()
  useRegistryVersion() // re-render when a late bundle registers a tool
  const plugins = getVisibleToolPlugins(data)
  const { activeSubPanelId, openSubPanel, isToolsOpen } = useSidePanel()
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
  })

  const activePlugin = plugins.find((p) => p.id === activeSubPanelId)
  if (activePlugin) {
    const { Component } = activePlugin.contributes.tool!.panel
    return (
      // Keyed by plugin so a failure in one panel resets when switching.
      <PanelErrorBoundary
        key={activePlugin.id}
        fallback={
          <Center flexGrow={1} padding="2rem">
            <Text variant="note">{t('panelError')}</Text>
          </Center>
        }
      >
        <Suspense fallback={<PanelFallback />}>
          <Component />
        </Suspense>
      </PanelErrorBoundary>
    )
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
      {plugins.map((plugin) => (
        <PluginToolButton
          key={plugin.id}
          plugin={plugin}
          onPress={() => openSubPanel(plugin.id)}
        />
      ))}
    </Div>
  )
}
