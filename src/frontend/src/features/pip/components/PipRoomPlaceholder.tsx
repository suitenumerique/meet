import { useTranslation } from 'react-i18next'
import { css } from '@/styled-system/css'
import { styled } from '@/styled-system/jsx'
import { usePictureInPicture } from '../hooks/usePictureInPicture'
import { Button, Text } from '@/primitives'

export const PipRoomPlaceholder = () => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'pictureInPicture.placeholder',
  })
  const { close } = usePictureInPicture()

  return (
    <Container data-theme="dark">
      <img
        src="/assets/pip.svg"
        alt=""
        width={144}
        height={102}
        aria-hidden="true"
        className={css({ marginBottom: '1rem' })}
      />
      <Text
        variant="h2"
        margin={false}
        padding={false}
        className={css({ color: 'content.semantic.neutral.primary' })}
      >
        {t('title')}
      </Text>
      <Text
        variant="body"
        wrap="balance"
        className={css({
          maxWidth: '30rem',
          marginTop: '0.25rem',
          color: 'content.semantic.neutral.secondary',
        })}
      >
        {t('description')}
      </Text>
      <Button
        variant="primaryTextDark"
        onPress={close}
        className={css({
          marginTop: '1.5rem',
          color: 'brand.250!',
        })}
      >
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
    padding: '1.5rem',
    textAlign: 'center',
  },
})
