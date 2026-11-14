import {
  type ComponentPropsWithoutRef,
  type SyntheticEvent,
  useState,
} from 'react'
import { css } from '@/styled-system/css'

const EXTENSION = /\.(png|jpe?g)$/i

export type PictureProps = Omit<ComponentPropsWithoutRef<'img'>, 'src'> & {
  src: string
  webp?: boolean
}

/**
 * Renders an image. With `webp`, browsers supporting WebP load the WebP
 * version of the image, `src` being the fallback for the others.
 *
 * A browser never falls back on its own when the WebP file fails to load, for
 * instance when a deployment overrides an illustration without providing its
 * WebP version. The WebP source is then dropped, so `src` gets loaded instead
 * of leaving a broken image.
 *
 * The `<picture>` wrapper uses `display: contents`, so the `<img>` is laid out
 * exactly as if it was rendered alone: style it through the usual props.
 */
export const Picture = ({
  src,
  webp = false,
  alt,
  onError,
  ...props
}: PictureProps) => {
  const [failedWebpSrc, setFailedWebpSrc] = useState<string>()
  const webpSrc =
    webp && EXTENSION.test(src) ? src.replace(EXTENSION, '.webp') : undefined
  const hasWebpSource = !!webpSrc && webpSrc !== failedWebpSrc

  const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
    if (hasWebpSource) {
      setFailedWebpSrc(webpSrc)
      return
    }
    onError?.(event)
  }

  return (
    <picture className={css({ display: 'contents' })}>
      {hasWebpSource && <source srcSet={webpSrc} type="image/webp" />}
      <img src={src} alt={alt} onError={handleError} {...props} />
    </picture>
  )
}
