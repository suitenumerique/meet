import { RiTranslateAi2 } from '@remixicon/react'
import { css } from '@/styled-system/css'
import { ToggleButton } from '@/primitives'
import { ToggleButtonProps } from '@/primitives/ToggleButton'
import {layoutStore} from "@/stores/layout.ts";
import {useSnapshot} from "valtio";
import {useLayout} from "../../hooks/useLayout";

export const SubtitleToggle = ({
  onPress,
  ...props
}: Partial<ToggleButtonProps>) => {
  const layoutSnap = useSnapshot(layoutStore)

  const { toggleSubtitle } = useLayout()

  return (
    <div
      className={css({
        position: 'relative',
        display: 'inline-block',
      })}
    >
      <ToggleButton
        square
        variant="primaryDark"
        isSelected={layoutSnap.showSubtitle}
        onPress={(e) => {
          toggleSubtitle()

          // todo - trigger agent to join the room and transcribe

          onPress?.(e)
        }}
        {...props}
      >
        <RiTranslateAi2 />
      </ToggleButton>
    </div>
  )
}
