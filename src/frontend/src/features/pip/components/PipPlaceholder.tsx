import { useTranslation } from 'react-i18next'
import { styled } from '@/styled-system/jsx'
import { useRoomPiP } from '../hooks/useRoomPiP'
import pipIllustration from '/assets/pip.svg'

export const PipPlaceholder = () => {
  const { t } = useTranslation('rooms', {
    keyPrefix: 'options.items.pictureInPicture.placeholder',
  })
  const { close } = useRoomPiP()

  return (
    <Container>
      <Illustration src={pipIllustration} alt="" width={102} height={72} aria-hidden="true" />
      <Title>{t('title')}</Title>
      <Description>{t('description')}</Description>
      <BringBackLink onClick={close}>{t('bringBack')}</BringBackLink>
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
  },
})

const Illustration = styled('img', {
  base: {
    marginBottom: '0.25rem',
  },
})

const Title = styled('p', {
  base: {
    color: 'white',
    fontSize: '0.875rem',
    fontWeight: 600,
    lineHeight: 1.3,
    margin: 0,
  },
})

const Description = styled('p', {
  base: {
    color: '#DFE2EA',
    fontSize: '0.75rem',
    fontWeight: 400,
    lineHeight: 1.4,
    margin: 0,
    maxWidth: '312px',
  },
})

const BringBackLink = styled('button', {
  base: {
    color: '#A2B6FF',
    fontSize: '0.75rem',
    fontWeight: 500,
    lineHeight: 1.4,
    cursor: 'pointer',
    marginTop: '0.25rem',
    borderRadius: '2px',
    _hover: {
      textDecoration: 'underline',
    },
    _focusVisible: {
      outline: '2px solid #A2B6FF',
      outlineOffset: '2px',
    },
  },
})
