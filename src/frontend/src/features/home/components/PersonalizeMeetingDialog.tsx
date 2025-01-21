import { FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Dialog, type DialogProps, Text } from '@/primitives'
import { HStack } from '@/styled-system/jsx'
import { RiSpam2Fill } from '@remixicon/react'
import { navigateTo } from '@/navigation/navigateTo.ts'
import { useCreateRoom } from '@/features/rooms'
import {
  FieldError,
  Form as RACForm,
  Input,
  Label,
  TextField,
} from 'react-aria-components'
import { css } from '@/styled-system/css'
import {
  MIN_ROOM_LENGTH,
  ALPHANUMERIC_LOWERCASE,
} from '@/features/rooms/utils/isRoomValid'

export const PersonalizeMeetingDialog = ({
  isOpen,
  ...dialogProps
}: Omit<DialogProps, 'title'>) => {
  const { t } = useTranslation('home', {
    keyPrefix: 'personalizeMeetingDialog',
  })
  const { mutateAsync: createRoom } = useCreateRoom()
  const [roomSlug, setRoomSlug] = useState('')
  const [serverErrors, setServerErrors] = useState<Array<string>>([])

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    createRoom({ slug: roomSlug })
      .then((data) =>
        navigateTo('room', data.slug, {
          state: { create: true, initialRoomData: data },
        })
      )
      .catch((e) => {
        const msg =
          e.statusCode === 400
            ? t('errors.server.taken')
            : t('errors.server.unknown')
        setServerErrors([msg])
      })
  }

  const validationErrors = []
  if (roomSlug.length < MIN_ROOM_LENGTH) {
    validationErrors.push(t('errors.validation.length'))
  }
  if (!new RegExp(`^${ALPHANUMERIC_LOWERCASE}+$`).test(roomSlug)) {
    validationErrors.push(t('errors.validation.spaceOrSpecialCharacter'))
  }

  const errors = [...validationErrors, ...serverErrors]

  return (
    <Dialog isOpen={!!isOpen} {...dialogProps} title={t('heading')}>
      <RACForm onSubmit={onSubmit}>
        <TextField
          isRequired
          isInvalid={errors.length > 0}
          value={roomSlug}
          onChange={(e) => {
            setServerErrors([])
            setRoomSlug(e.toLowerCase())
          }}
          className={css({
            display: 'flex',
            flexDirection: 'column',
          })}
        >
          <Label>{t('label')}</Label>
          <div
            className={css({
              display: 'flex',
              justifyContent: 'space-between',
            })}
          >
            <Input
              className={css({
                height: '46px',
                border: '1px solid black',
                padding: '4px 8px',
                width: '80%',
                borderRadius: '0.25rem',
              })}
              placeholder={t('placeholder')}
            />
            <Button type="submit">{t('submit')}</Button>
          </div>
          <div
            className={css({
              minHeight: '72px',
            })}
          >
            <FieldError>
              <ul
                className={css({
                  listStyle: 'square inside',
                  color: 'red',
                  marginLeft: '10px',
                  marginTop: '10px',
                })}
              >
                {errors.map((error, i) => (
                  <li key={i}>
                    <Text as="span" variant={'sm'}>
                      {error}
                    </Text>
                  </li>
                ))}
              </ul>
            </FieldError>
          </div>
        </TextField>
      </RACForm>

      <HStack>
        <div
          style={{
            backgroundColor: '#d9e5ff',
            borderRadius: '50%',
            padding: '4px',
            marginTop: '1rem',
          }}
        >
          <RiSpam2Fill size={22} style={{ fill: '#4c84fc' }} />
        </div>
        <Text variant="sm" style={{ marginTop: '1rem', textWrap: 'balance' }}>
          {t('warning')}
        </Text>
      </HStack>
    </Dialog>
  )
}
