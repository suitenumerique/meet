import { Button } from '@/primitives'
import { css } from '@/styled-system/css'
import { RiExternalLinkLine } from '@remixicon/react'
import { useTranslation } from 'react-i18next'

export const Feedback = () => {
  const { t } = useTranslation()
  return (
    <Button
      href="https://grist.incubateur.net/o/docs/forms/1YrfNP1QSSy8p2gCxMFnSf/4"
      variant="success"
      target="_blank"
    >
      <span className={css({ marginRight: 0.5 })} aria-hidden="true">
        💡
      </span>
      {t('feedbackAlert')}
      <RiExternalLinkLine
        size={16}
        className={css({ marginLeft: 0.5 })}
        aria-hidden="true"
      />
    </Button>
  )
}
