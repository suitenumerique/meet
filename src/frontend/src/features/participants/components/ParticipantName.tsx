import React, { useLayoutEffect, useRef, useState } from 'react'
import { Text } from '@/primitives'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { VisualOnlyTooltip } from '@/primitives/VisualOnlyTooltip'

export const ParticipantName = React.memo(
  ({ displayedName, isLocal }: { displayedName: string; isLocal: boolean }) => {
    const { t } = useTranslation('rooms')

    const nameRef = useRef<HTMLParagraphElement>(null)
    const [isTruncated, setIsTruncated] = useState(false)

    useLayoutEffect(() => {
      const el = nameRef.current
      if (!el) return
      const truncated = el.scrollWidth > el.clientWidth
      setIsTruncated((prev) => (prev === truncated ? prev : truncated))
    }, [displayedName])

    return (
      <Text
        as="div"
        variant="sm"
        className={css({
          userSelect: 'none',
          cursor: 'default',
          display: 'flex',
          minWidth: 0,
          width: 'full',
          maxWidth: 'full',
        })}
      >
        <VisualOnlyTooltip
          tooltip={displayedName}
          disabled={!isTruncated}
          className={css({ display: 'flex', minWidth: 0, flex: 1 })}
        >
          <p
            className={css({
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'block',
              minWidth: 0,
            })}
            ref={nameRef}
          >
            {displayedName}
          </p>
        </VisualOnlyTooltip>
        {isLocal && (
          <span
            className={css({
              marginLeft: '.25rem',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            })}
          >
            ({t('participants.you')})
          </span>
        )}
      </Text>
    )
  }
)

ParticipantName.displayName = 'ParticipantName'
