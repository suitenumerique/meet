import { useSnapshot } from 'valtio'
import { css } from '@/styled-system/css'
import { Icon, Text } from '@/primitives'
import { toneColor } from '@/primitives/tone'
import { bannerStore } from './bannerStore'

/**
 * Host-owned ambient-banner overlay: one fixed pill per active banner in
 * `bannerStore`. Positioned under the recording egress banner so both coexist;
 * multiple banners stack vertically.
 */
export const Banners = () => {
  const { banners } = useSnapshot(bannerStore)

  if (banners.length === 0) {
    return null
  }

  return (
    <div
      className={css({
        position: 'fixed',
        top: '48px',
        left: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        zIndex: 1,
      })}
    >
      {banners.map((banner) => (
        <div
          key={banner.id}
          data-attr={banner.testId ?? `banner-${banner.id}`}
          className={css({
            display: 'flex',
            paddingY: '0.25rem',
            paddingX: '0.75rem',
            backgroundColor: toneColor[banner.tone ?? 'info'],
            borderColor: 'white',
            border: '1px solid',
            color: 'white',
            borderRadius: '4px',
            gap: '0.5rem',
            alignItems: 'center',
          })}
        >
          <span
            aria-hidden="true"
            className={css({
              width: '0.5rem',
              height: '0.5rem',
              borderRadius: '50%',
              backgroundColor: 'white',
              flexShrink: 0,
            })}
          />
          {banner.icon && <Icon type="symbols" name={banner.icon} />}
          <Text
            variant="sm"
            className={css({
              fontWeight: '500 !important',
            })}
          >
            {banner.text}
          </Text>
        </div>
      ))}
    </div>
  )
}
