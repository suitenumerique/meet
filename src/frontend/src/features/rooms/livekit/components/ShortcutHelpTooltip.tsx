import React, { useCallback, useEffect, useMemo } from 'react'
import { css } from '@/styled-system/css'
import { shortcutCatalog } from '@/features/shortcuts/catalog'
import { isMacintosh } from '@/utils/livekit'
import {
  closeShortcutHelp,
  shortcutHelpStore,
  toggleShortcutHelp,
} from '@/stores/shortcutHelp'
import { useSnapshot } from 'valtio'
import { Shortcut } from '@/features/shortcuts/types'

type ShortcutHelpTooltipProps = {
  triggerLabel: string
  isVisible?: boolean
}

const formatShortcutLabel = (shortcut?: Shortcut) => {
  if (!shortcut) return '—'
  const key = shortcut.key?.toUpperCase()
  if (!key) return '—'
  if (shortcut.ctrlKey) return `${isMacintosh() ? '⌘' : 'Ctrl'}+${key}`
  return key
}

const formatLongPressLabel = (code?: string) => {
  if (!code) return '—'
  if (code.startsWith('Key') && code.length === 4) {
    return `Hold ${code.slice(3)}`
  }
  return `Hold ${code}`
}

export const ShortcutHelpTooltip: React.FC<ShortcutHelpTooltipProps> = ({
  triggerLabel,
  isVisible = false,
}) => {
  const { isOpen } = useSnapshot(shortcutHelpStore)
  const isContainerVisible = isVisible || isOpen

  const grouped = useMemo(() => {
    return shortcutCatalog.reduce<Record<string, typeof shortcutCatalog>>(
      (acc, item) => {
        acc[item.category] = acc[item.category] || []
        acc[item.category].push(item)
        return acc
      },
      {}
    )
  }, [])

  const handleToggle = useCallback(() => {
    toggleShortcutHelp()
  }, [])

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
          {isOpen ? '−' : '+'}
        </span>
      </button>

      <div
        id="shortcut-help-panel"
        role="group"
        aria-label="Keyboard shortcuts"
        data-open={isOpen}
        className={css({
          overflow: 'hidden',
          maxHeight: '0px',
          opacity: 0,
          mt: '0',
          transition:
            'max-height 200ms ease, opacity 200ms ease, margin-top 200ms ease',
          '&[data-open="true"]': {
            maxHeight: '400px',
            opacity: 1,
            mt: '0.35rem',
          },
        })}
      >
        {Object.entries(grouped).map(([category, items]) => (
          <div
            key={category}
            className={css({
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
              mb: '0.35rem',
            })}
          >
            <div
              className={css({
                textTransform: 'capitalize',
                fontSize: '0.75rem',
                opacity: 0.8,
              })}
            >
              {category}
            </div>
            {items.map((item) => (
              <div
                key={item.id}
                className={css({
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  alignItems: 'center',
                  fontSize: '0.85rem',
                })}
              >
                <span>{item.label}</span>
                <span
                  className={css({
                    fontFamily: 'monospace',
                    backgroundColor: 'rgba(255,255,255,0.12)',
                    paddingInline: '0.35rem',
                    paddingBlock: '0.15rem',
                    borderRadius: '6px',
                    whiteSpace: 'nowrap',
                  })}
                >
                  {item.kind === 'longPress'
                    ? formatLongPressLabel(item.code)
                    : formatShortcutLabel(item.shortcut)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
