import { useMemo } from 'react'
import { useSubtitles } from '../hooks/useSubtitles'
import { css, cva } from '@/styled-system/css'
import { styled } from '@/styled-system/jsx'
import { Avatar } from '@/components/Avatar'
import { Text } from '@/primitives'
import { useSnapshot, type Snapshot } from 'valtio'
import { captionBus, type NormalizedCaption } from '../captionBus'
import {
  accessibilityStore,
  CAPTION_TEXT_SIZE_OPTIONS,
  CAPTION_FONT_COLOR_VALUES,
  CAPTION_BACKGROUND_COLOR_VALUES,
  type CaptionTextSize,
} from '@/stores/accessibility'

const FONT_SIZE_CONFIG: Record<
  CaptionTextSize,
  { fontSize: string; lineHeight: string }
> = {
  small: { fontSize: '0.875rem', lineHeight: '1.2rem' },
  medium: { fontSize: '1.5rem', lineHeight: '1.7rem' },
  large: { fontSize: '2.25rem', lineHeight: '2.5rem' },
}

const CAPTION_FONT_SIZES = Object.fromEntries(
  CAPTION_TEXT_SIZE_OPTIONS.map((size) => [size, FONT_SIZE_CONFIG[size]])
) as Record<CaptionTextSize, { fontSize: string; lineHeight: string }>

/** Read-only caption as seen through the bus snapshot. */
type SnapshotCaption = Snapshot<NormalizedCaption>

/** A contiguous run of captions from the same speaker, ready to render. */
interface CaptionRow {
  id: string
  speaker: SnapshotCaption['speaker']
  captions: SnapshotCaption[]
}

const Transcription = ({ row }: { row: CaptionRow }) => {
  const { captionTextSize, captionFontColor, captionBackgroundColor } =
    useSnapshot(accessibilityStore)
  const { speaker } = row
  const participantName = speaker.name
  const participantColor = speaker.color
  const { fontSize, lineHeight } = CAPTION_FONT_SIZES[captionTextSize]
  const fontColor = CAPTION_FONT_COLOR_VALUES[captionFontColor]
  const backgroundColor =
    CAPTION_BACKGROUND_COLOR_VALUES[captionBackgroundColor]

  const displayText = row.captions
    .map((caption) => caption.text.trim())
    .filter((text) => text)
    .join(' ')

  if (!displayText) return null

  return (
    <div
      className={css({
        maxWidth: '800px',
        width: '100%',
      })}
    >
      <div
        className={css({
          display: 'flex',
          gap: '0.5rem',
        })}
      >
        <Avatar
          name={participantName}
          bgColor={participantColor}
          context="subtitles"
        />
        <div
          className={css({
            width: '100%',
          })}
          style={{ color: fontColor }}
        >
          <Text variant="h3" margin={false}>
            {participantName}
          </Text>
          <p
            data-attr="caption-overlay-line"
            className={css({
              fontWeight: '400',
              borderRadius: '4px',
              padding: '0.125rem 0.25rem',
            })}
            style={{ fontSize, lineHeight, backgroundColor }}
          >
            {displayText}
          </p>
        </div>
      </div>
    </div>
  )
}

const SubtitlesWrapper = styled(
  'div',
  cva({
    base: {
      width: '100%',
      paddingTop: 'var(--lk-grid-gap)',
      transition: 'height .5s cubic-bezier(0.4,0,0.2,1) 5ms',
    },
    variants: {
      areOpen: {
        true: {
          height: '12rem',
        },
        false: {
          height: '0',
        },
      },
    },
  })
)

export const Subtitles = () => {
  const { areSubtitlesOpen } = useSubtitles()
  const { stream } = useSnapshot(captionBus)

  const captionRows = useMemo(() => {
    if (stream.length === 0) return []

    const rows: CaptionRow[] = []
    let currentRow: CaptionRow | null = null

    for (const caption of stream) {
      const shouldStartNewRow =
        !currentRow || currentRow.speaker.key !== caption.speaker.key

      if (shouldStartNewRow) {
        currentRow = {
          id: `${caption.speaker.key}-${caption.firstReceivedTime}`,
          speaker: caption.speaker,
          captions: [caption],
        }
        rows.push(currentRow)
      } else if (currentRow) {
        currentRow.captions.push(caption)
      }
    }
    return rows
  }, [stream])

  return (
    <SubtitlesWrapper areOpen={areSubtitlesOpen}>
      <div
        className={css({
          height: '100%',
          width: '100%',
          display: 'flex',
          gap: '1.25rem',
          flexDirection: 'column-reverse',
          overflowAnchor: 'auto',
          overflowY: 'scroll',
          padding: '0 1rem',
          alignItems: 'center',
        })}
      >
        {captionRows
          .slice()
          .reverse()
          .map((row) => (
            <Transcription key={row.id} row={row} />
          ))}
      </div>
    </SubtitlesWrapper>
  )
}
