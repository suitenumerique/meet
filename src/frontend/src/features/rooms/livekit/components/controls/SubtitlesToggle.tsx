import { useTranslation } from 'react-i18next'
import { useSnapshot } from 'valtio'
import { RiClosedCaptioningLine } from '@remixicon/react'
import { Popover, Text, ToggleButton } from '@/primitives'
import { css } from '@/styled-system/css'
import { useSubtitles } from '@/features/subtitle/hooks/useSubtitles'
import { useAreSubtitlesAvailable } from '@/features/subtitle/hooks/useAreSubtitlesAvailable'
import { useCaptionTakeover } from '@/features/subtitle/captionBus'
import {
  captionButtonStore,
  dismissCaptionPopover,
} from '@/features/subtitle/captionButtonStore'
import { toneColor } from '@/primitives/tone'
import { layoutStore } from '@/stores/layout'

export const SubtitlesToggle = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'controls.subtitles' })
  const { areSubtitlesOpen, toggleSubtitles, areSubtitlesPending } =
    useSubtitles()
  const tooltipLabel = areSubtitlesOpen ? 'open' : 'closed'
  const areSubtitlesAvailable = useAreSubtitlesAvailable()

  // Decoration surface; with none set, the render collapses to the original.
  const { decoration: deco, popover } = useSnapshot(captionButtonStore)
  // While a plugin owns the caption bus, CC toggles ONLY the overlay (no
  // start-subtitle POST that would re-dispatch the native agent).
  const overridden = useCaptionTakeover()

  if (!areSubtitlesAvailable) return null

  const tone = deco?.tone ?? 'info'
  const buttonLabel = deco?.label ?? t(tooltipLabel)
  const onPress = overridden
    ? () => {
        layoutStore.showSubtitles = !layoutStore.showSubtitles
      }
    : toggleSubtitles
  const popoverActive = !!popover

  const button = (
    <ToggleButton
      square
      variant="primaryDark"
      aria-label={buttonLabel}
      tooltip={buttonLabel}
      isSelected={areSubtitlesOpen}
      isDisabled={areSubtitlesPending}
      onPress={onPress}
      data-attr={`controls-subtitles-${tooltipLabel}`}
    >
      <RiClosedCaptioningLine />
    </ToggleButton>
  )

  return (
    <div
      className={css({
        position: 'relative',
        display: 'inline-block',
      })}
    >
      {popoverActive ? (
        <Popover
          isOpen
          onOpenChange={(open) => {
            if (!open) dismissCaptionPopover()
          }}
        >
          {button}
          <Text
            variant="sm"
            data-attr={popover?.testId ?? `caption-popover-${deco?.id}`}
            className={css({ display: 'block', maxWidth: '14rem' })}
          >
            {popover?.text}
          </Text>
        </Popover>
      ) : (
        button
      )}
      {deco?.live && (
        <span
          aria-hidden="true"
          className={css({
            position: 'absolute',
            inset: 0,
            borderRadius: '4px',
            border: '2px solid',
            color: toneColor[tone],
            animation: 'caption_live_ring 1.8s ease-out infinite',
            pointerEvents: 'none',
          })}
        />
      )}
      {deco?.badge && (
        <span
          data-attr={deco.testId ?? `caption-badge-${deco.id}`}
          className={css({
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            paddingX: '0.25rem',
            minWidth: '1rem',
            height: '1rem',
            lineHeight: '1rem',
            fontSize: '0.625rem',
            fontWeight: 700,
            textAlign: 'center',
            color: 'white',
            backgroundColor: toneColor[tone],
            border: '1px solid white',
            borderRadius: '999px',
            pointerEvents: 'none',
            zIndex: 1,
          })}
        >
          {deco.badge}
        </span>
      )}
    </div>
  )
}
