import { type ComponentPropsWithoutRef } from 'react'
import { css } from '@/styled-system/css'

const WEBP_CONVERTIBLE_EXTENSION = /\.(png|jpe?g)$/i

export type PictureProps = Omit<ComponentPropsWithoutRef<'img'>, 'src'> & {
  src: string
}

/**
 * Serves the WebP version of an image, and falls back on the original file
 * for browsers that do not support WebP.
 *
 * The `<picture>` wrapper uses `display: contents`, so the `<img>` is laid out
 * exactly as if it was rendered alone: style it through the usual props.
 */
export const Picture = ({ src, alt, ...props }: PictureProps) => {
  const hasWebpVersion = WEBP_CONVERTIBLE_EXTENSION.test(src)
  return (
    <picture className={css({ display: 'contents' })}>
      {hasWebpVersion && (
        <source
          srcSet={src.replace(WEBP_CONVERTIBLE_EXTENSION, '.webp')}
          type="image/webp"
        />
      )}
      <img src={src} alt={alt} {...props} />
    </picture>
  )
}
