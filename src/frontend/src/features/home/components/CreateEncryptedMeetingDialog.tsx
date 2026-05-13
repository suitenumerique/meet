import { useTranslation } from 'react-i18next'
import { Button, Dialog } from '@/primitives'
import { HStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import {
  RiPhoneLine,
  RiComputerLine,
  RiFileTextLine,
  RiRecordCircleLine,
} from '@remixicon/react'
import { FeaturePill } from '@/features/encryption'

interface Props {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export const CreateEncryptedMeetingDialog = ({
  isOpen,
  onOpenChange,
  onConfirm,
}: Props) => {
  const { t } = useTranslation('home', {
    keyPrefix: 'createEncryptedMeetingDialog',
  })

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t('title')}
      role="dialog"
    >
      <p
        className={css({
          fontSize: '0.9rem',
          color: 'greyscale.700',
          marginBottom: '0.75rem',
        })}
      >
        {t('description')}
      </p>
      <div
        className={css({
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '1rem',
        })}
      >
        <FeaturePill
          icon={<RiPhoneLine size={14} />}
          label={t('features.dialIn')}
        />
        <FeaturePill
          icon={<RiComputerLine size={14} />}
          label={t('features.meetingRoom')}
        />
        <FeaturePill
          icon={<RiFileTextLine size={14} />}
          label={t('features.transcription')}
        />
        <FeaturePill
          icon={<RiRecordCircleLine size={14} />}
          label={t('features.recording')}
        />
      </div>
      <p
        className={css({
          fontSize: '0.85rem',
          color: 'greyscale.700',
          marginBottom: '1.25rem',
        })}
      >
        {t('warning')}
      </p>
      <HStack gap="0.5rem" justify="flex-end">
        <Button variant="tertiary" onPress={() => onOpenChange(false)}>
          {t('cancel')}
        </Button>
        <Button
          variant="primary"
          onPress={onConfirm}
          data-attr="create-encrypted-confirm"
        >
          {t('confirm')}
        </Button>
      </HStack>
    </Dialog>
  )
}
