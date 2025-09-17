import { Button } from '@/primitives'
import { RiErrorWarningFill } from '@remixicon/react'
import { openPermissionsDialog } from '@/stores/permissions'
import { css } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'

export const PermissionNeededButton = () => {
  const { t } = useTranslation('rooms', { keyPrefix: 'permissionsButton' })
  return (
    <div
      className={css({
        position: 'absolute',
        bottom: 'auto',
        left: '-.55rem',
        top: '-.55rem',
        zIndex: 1,
      })}
    >
      <Button
        aria-label={t('ariaLabel')}
        tooltip={t('tooltip')}
        onPress={() => openPermissionsDialog()}
        variant="permission"
      >
        <div
          className={css({
            position: 'relative',
            zIndex: 2,
          })}
        >
          <RiErrorWarningFill size={28} />
        </div>
        <div
          className={css({
            width: '18px',
            height: '18px',
            position: 'absolute',
            top: '4px',
            left: '4px',
            backgroundColor: 'black',
            borderRadius: '100%',
          })}
        />
      </Button>
    </div>
  )
}
