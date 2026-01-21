import { useTranslation } from 'react-i18next'
import { RiMoreFill } from '@remixicon/react'
import { Button, Menu } from '@/primitives'
import { OptionsMenuItems } from './OptionsMenuItems'
import { useOverlayPortalContainer } from '@/primitives/useOverlayPortalContainer'
import { useEffect, useRef, useState } from 'react'
import { PipOptionsMenu } from './PipOptionsMenu'

export const OptionsButton = () => {
  const { t } = useTranslation('rooms')
  const portalContainer = useOverlayPortalContainer()
  const isInPiP =
    portalContainer && portalContainer.ownerDocument !== document
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen || !isInPiP) return
    const doc = wrapperRef.current?.ownerDocument ?? document

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      const wrapper = wrapperRef.current
      if (!wrapper || !target) return
      if (!wrapper.contains(target)) {
        setIsOpen(false)
      }
    }

    doc.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      doc.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [isInPiP, isOpen])



  if (isInPiP) {
    return (
      <PipOptionsMenu
        wrapperRef={wrapperRef}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        label={t('options.buttonLabel')}
      />
    )
  }

  return (
    <Menu variant="dark">
      <Button
        id="room-options-trigger"
        square
        variant="primaryDark"
        aria-label={t('options.buttonLabel')}
        tooltip={t('options.buttonLabel')}
      >
        <RiMoreFill />
      </Button>
      <OptionsMenuItems />
    </Menu>
  )
}
