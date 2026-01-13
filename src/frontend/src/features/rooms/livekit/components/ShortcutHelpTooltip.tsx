import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { css } from '@/styled-system/css'
import { shortcutCatalog } from '@/features/shortcuts/catalog'
import {
  formatLongPressLabel,
  formatShortcutLabel,
  formatShortcutLabelForSR as formatShortcutLabelForSRHelper,
  getKeyLabelFromCode,
} from '@/features/shortcuts/formatLabels'
import { useFocusTrap } from '@/features/shortcuts/useFocusTrap'
import {
  closeShortcutHelp,
  shortcutHelpStore,
  toggleShortcutHelp,
} from '@/stores/shortcutHelp'
import { useSnapshot } from 'valtio'
import { useTranslation } from 'react-i18next'
import { Shortcut } from '@/features/shortcuts/types'
import {
  loadShortcutOverrides,
  shortcutOverridesStore,
} from '@/stores/shortcutOverrides'

type ShortcutHelpTooltipProps = {
  triggerLabel: string
  isVisible?: boolean
}

export const ShortcutHelpTooltip: React.FC<ShortcutHelpTooltipProps> = ({
  triggerLabel,
  isVisible = false,
}) => {
  const { t } = useTranslation('rooms')
  const { isOpen } = useSnapshot(shortcutHelpStore)
  loadShortcutOverrides()
  const { overrides } = useSnapshot(shortcutOverridesStore)
  const isContainerVisible = isVisible || isOpen
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const wasOpenRef = useRef(false)

  useFocusTrap(panelRef, { isActive: isOpen, fallbackRef: panelRef })

  useFocusTrap(panelRef, { isActive: isOpen, fallbackRef: panelRef })

  const grouped = useMemo(() => {
    return shortcutCatalog.reduce<
      Record<
        string,
        {
          item: (typeof shortcutCatalog)[number]
          effective: Shortcut | undefined
        }[]
      >
    >((acc, item) => {
      const effective = overrides.get(item.id) ?? item.shortcut
      acc[item.category] = acc[item.category] || []
      acc[item.category].push({ item, effective })
      return acc
    }, {})
  }, [overrides])
  const entries = Object.entries(grouped)
  const hasItems = entries.length > 0

  const getCategoryLabel = useCallback(
    (category: string) => t(`shortcutsPanel.categories.${category}`),
    [t]
  )

  const getActionLabel = useCallback(
    (id: string) => t(`shortcutsPanel.actions.${id}`),
    [t]
  )

  // SR-friendly label for a shortcut (reads “Control plus D”).
  const formatShortcutLabelForSR = useCallback(
    (shortcut?: Shortcut) =>
      formatShortcutLabelForSRHelper(shortcut, {
        controlLabel: t('shortcutsPanel.sr.control'),
        commandLabel: t('shortcutsPanel.sr.command'),
        plusLabel: t('shortcutsPanel.sr.plus'),
        noShortcutLabel: t('shortcutsPanel.sr.noShortcut'),
      }),
    [t]
  )

  const formatLongPressSR = useCallback(
    (code?: string) => {
      const label = getKeyLabelFromCode(code)
      return formatLongPressLabel(
        label,
        t('shortcutsPanel.sr.hold', { key: '{{key}}' })
      )
    },
    [t]
  )

  const formatLongPressVisual = useCallback(
    (code?: string) => {
      const label = getKeyLabelFromCode(code)
      return formatLongPressLabel(
        label,
        t('shortcutsPanel.visual.hold', { key: '{{key}}' })
      )
    },
    [t]
  )

  const handleToggle = useCallback(() => {
    toggleShortcutHelp()
  }, [])

  // Close the panel when Escape is pressed.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeShortcutHelp()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen])

  // Focus management: move focus into the panel when opened, return to trigger when closed.
  useEffect(() => {
    if (isOpen) {
      // Focus the panel container to avoid double announcement of headings.
      panelRef.current?.focus()
    } else if (wasOpenRef.current && !isOpen && triggerRef.current) {
      triggerRef.current.focus()
    }
    wasOpenRef.current = isOpen
  }, [isOpen])

  return (
    <div
      data-visible={isContainerVisible}
      className={css({
        position: 'absolute',
        top: '0.75rem',
        right: '0.75rem',
        color: 'white',
        borderRadius: 'calc(var(--lk-border-radius) / 2)',
        backgroundColor: 'rgba(0,0,0,0.65)',
        paddingInline: '0.5rem',
        paddingBlock: '0.25rem',
        fontSize: '0.875rem',
        minWidth: '200px',
        maxWidth: '320px',
        boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
        zIndex: 10,
        opacity: 0,
        visibility: 'hidden',
        pointerEvents: 'none',
        transition: 'opacity 150ms ease',
        '&[data-visible="true"]': {
          opacity: 1,
          visibility: 'visible',
          pointerEvents: 'auto',
        },
      })}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="shortcut-help-panel"
        onClick={handleToggle}
        ref={triggerRef}
        className={css({
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          color: 'white',
          fontWeight: 600,
          gap: '0.5rem',
          outline: 'none',
          '&:focus-visible': {
            outline: '2px solid rgba(255,255,255,0.5)',
            outlineOffset: '2px',
            borderRadius: '6px',
          },
        })}
      >
        <span>{triggerLabel}</span>
        <span
          aria-hidden
          className={css({
            fontSize: '0.75rem',
            opacity: 0.8,
          })}
        >
          {isOpen ? '▾' : '▸'}
        </span>
      </button>

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        id="shortcut-help-panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="shortcut-help-title"
        data-open={isOpen}
        ref={panelRef}
        tabIndex={-1}
        className={css({
          overflow: 'hidden',
          overflowY: 'hidden',
          maxHeight: '0px',
          opacity: 0,
          mt: '0',
          transition:
            'max-height 200ms ease, opacity 200ms ease, margin-top 200ms ease',
          '&[data-open="true"]': {
            maxHeight: '400px',
            opacity: 1,
            mt: '0.35rem',
            overflowY: 'auto',
            paddingRight: '0.25rem',
          },
        })}
      >
        <h2 id="shortcut-help-title" className="sr-only">
          {t('shortcutsPanel.title')}
        </h2>
        {hasItems ? (
          entries.map(([category, items]) => (
            <section
              key={category}
              className={css({
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                mb: '0.5rem',
              })}
            >
              <h3
                id={`shortcut-section-${category}`}
                data-shortcuts-heading
                tabIndex={-1}
                className={css({
                  textTransform: 'capitalize',
                  fontSize: '0.75rem',
                  opacity: 0.8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                })}
              >
                {getCategoryLabel(category)}
              </h3>
              <ul
                aria-labelledby={`shortcut-section-${category}`}
                className={css({
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                })}
              >
                {items.map(({ item, effective }) => {
                  const visualShortcut =
                    item.kind === 'longPress'
                      ? formatLongPressVisual(item.code)
                      : formatShortcutLabel(effective)
                  const srShortcut =
                    item.kind === 'longPress'
                      ? formatLongPressSR(item.code)
                      : formatShortcutLabelForSR(effective)
                  return (
                    <li
                      key={item.id}
                      aria-label={`${getActionLabel(item.id)}, ${srShortcut}`}
                      className={css({
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        alignItems: 'center',
                        fontSize: '0.85rem',
                      })}
                    >
                      <span>{getActionLabel(item.id)}</span>
                      <span
                        aria-hidden
                        className={css({
                          fontFamily: 'monospace',
                          backgroundColor: 'rgba(255,255,255,0.12)',
                          paddingInline: '0.35rem',
                          paddingBlock: '0.15rem',
                          borderRadius: '6px',
                          whiteSpace: 'nowrap',
                        })}
                      >
                        {visualShortcut}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        ) : (
          <div
            className={css({
              fontSize: '0.85rem',
              opacity: 0.8,
            })}
          >
            No shortcuts available.
          </div>
        )}
      </div>
    </div>
  )
}
