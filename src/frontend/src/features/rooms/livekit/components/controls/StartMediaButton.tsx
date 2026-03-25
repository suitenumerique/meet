import {
  useRoomContext,
  useStartAudio,
  useStartVideo,
} from '@livekit/components-react'
import React from 'react'

/** @public */
export interface AllowMediaPlaybackProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string
}

/**
 * The `StartMediaButton` component is only visible when the browser blocks media playback. This is due to some browser implemented autoplay policies.
 * To start media playback, the user must perform a user-initiated event such as clicking this button.
 * As soon as media playback starts, the button hides itself again.
 *
 * @example
 * ```tsx
 * <LiveKitRoom>
 *   <StartMediaButton label="Click to allow media playback" />
 * </LiveKitRoom>
 * ```
 *
 * @see Autoplay policy on MDN web docs: {@link https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices#autoplay_policy}
 * @public
 */
export const StartMediaButton: (
  props: AllowMediaPlaybackProps & React.RefAttributes<HTMLButtonElement>
) => React.ReactNode = /* @__PURE__ */ React.forwardRef<
  HTMLButtonElement,
  AllowMediaPlaybackProps
>(function StartMediaButton({ label, ...props }: AllowMediaPlaybackProps, ref) {
  const room = useRoomContext()
  const { mergedProps: audioProps, canPlayAudio } = useStartAudio({
    room,
    props,
  })
  const { mergedProps, canPlayVideo } = useStartVideo({
    room,
    props: audioProps,
  })
  const { style, ...restProps } = mergedProps
  style.display = canPlayAudio && canPlayVideo ? 'none' : 'block'

  return (
    <button ref={ref} style={style} {...restProps}>
      {label ?? `Start ${!canPlayAudio ? 'Audio' : 'Video'}`}
    </button>
  )
})
