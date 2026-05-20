import { useTranslation } from 'react-i18next'
import { styled } from '@/styled-system/jsx'
import { usePictureInPicture } from '../hooks/usePictureInPicture'
import { Button, Text } from '@/primitives'

export const PipRoomPlaceholder = () => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'pictureInPicture.placeholder',
  })
  const { close } = usePictureInPicture()

  return (
    <Container>
      <img
        src="/assets/pip.svg"
        alt=""
        width={300}
        height={72}
        aria-hidden="true"
        style={{
          marginBottom: '0.25rem',
        }}
      />
      <Text variant="body">{t('title')}</Text>
      <Text variant="sm" style={{ maxWidth: '312px' }}>
        {t('description')}
      </Text>
      <Button variant="primaryTextDark" onPress={close}>
        {t('bringBack')}
      </Button>
    </Container>
  )
}

const Container = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    gap: '0.5rem',
    padding: '1.5rem',
    textAlign: 'center',
    color: 'white',
  },
})
