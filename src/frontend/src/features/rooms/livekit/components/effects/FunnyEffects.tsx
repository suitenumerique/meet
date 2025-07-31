import { css } from '@/styled-system/css'
import { H, ToggleButton } from '@/primitives'
import { ProcessorType } from '../blur'
import { RiGlassesLine, RiGoblet2Fill } from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { FaceLandmarksProcessor } from '../blur/FaceLandmarksProcessor'
import { LocalVideoTrack } from 'livekit-client'

export type FunnyEffectsProps = {
  videoTrack?: LocalVideoTrack
  isPending?: boolean
  onPending: (value: boolean) => void
}

export const FunnyEffects = ({
  videoTrack,
  isPending,
  onPending,
}: FunnyEffectsProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'effects' })

  const getOptions = () => {
    const processor = videoTrack?.getProcessor() as FaceLandmarksProcessor
    if (!processor || processor.type != ProcessorType.FACE_LANDMARKS) {
      return {
        showGlasses: false,
        showFrench: false,
      }
    }
    return processor.serialize().options
  }

  const options = getOptions()

  const toggleFaceLandmarkEffect = async (
    showEffect: 'showGlasses' | 'showFrench'
  ) => {
    const options = getOptions()
    const processor = videoTrack?.getProcessor() as FaceLandmarksProcessor

    const newOptions = {
      ...options,
      [showEffect]: !options[showEffect],
    }

    onPending(true)

    try {
      if (!newOptions.showGlasses && !newOptions.showFrench) {
        await videoTrack?.stopProcessor()
      } else if (options.showGlasses || options.showFrench) {
        await processor?.update(newOptions)
      } else {
        const newProcessor = new FaceLandmarksProcessor(newOptions)
        await videoTrack?.setProcessor(newProcessor)
      }
    } catch (e) {
      console.error('could not update processor', e)
    } finally {
      onPending(false)
    }
  }

  const getLabelAction = (enabled: boolean) => (enabled ? 'clear' : 'apply')

  return (
    <div
      className={css({
        marginBottom: '1.5rem',
      })}
    >
      <H
        lvl={3}
        style={{
          marginBottom: '1rem',
        }}
        variant="bodyXsBold"
      >
        {t('faceLandmarks.title')}
      </H>
      <div
        className={css({
          display: 'flex',
          gap: '1.25rem',
        })}
      >
        <ToggleButton
          variant="bigSquare"
          aria-label={t(
            `faceLandmarks.glasses.${getLabelAction(options.showGlasses)}`
          )}
          tooltip={t(
            `faceLandmarks.glasses.${getLabelAction(options.showGlasses)}`
          )}
          isDisabled={isPending}
          onChange={async () => await toggleFaceLandmarkEffect('showGlasses')}
          isSelected={options.showGlasses}
          data-attr="toggle-glasses"
        >
          <RiGlassesLine />
        </ToggleButton>
        <ToggleButton
          variant="bigSquare"
          aria-label={t(
            `faceLandmarks.french.${getLabelAction(options.showFrench)}`
          )}
          tooltip={t(
            `faceLandmarks.french.${getLabelAction(options.showFrench)}`
          )}
          isDisabled={isPending}
          onChange={async () => await toggleFaceLandmarkEffect('showFrench')}
          isSelected={options.showFrench}
          data-attr="toggle-french"
        >
          <RiGoblet2Fill />
        </ToggleButton>
      </div>
    </div>
  )
}
