import { styled } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { Button, LinkButton } from '@/primitives'
import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfig } from '@/api/useConfig'

const Heading = styled('h2', {
  base: {
    width: 'fit-content',
    marginBottom: 0,
    fontSize: '1.3rem',
    fontWeight: '700',
    marginTop: '0.75rem',
    lineHeight: '1.7rem',
    maxWidth: '23rem',
    textAlign: 'center',
    textWrap: 'balance',
  },
})

const Body = styled('p', {
  base: {
    maxWidth: '23rem',
    textAlign: 'center',
    textWrap: 'pretty',
    lineHeight: '1.4rem',
    fontSize: '1rem',
  },
})

const Image = styled('img', {
  base: {
    maxHeight: '362px',
    height: '100%',
    width: 'fit-content',
  },
})

const Dot = styled('div', {
  base: {
    borderRadius: '50%',
    display: 'inline-block',
    height: '.375rem',
    margin: '0 .25rem',
    width: '.375rem',
  },
  variants: {
    selected: {
      true: {
        backgroundColor: 'primary.800',
      },
      false: {
        backgroundColor: 'primary.300',
      },
    },
  },
})

const Container = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    justifyContent: 'space-between',
    textAlign: 'center',
  },
})

const ButtonContainer = styled('div', {
  base: {
    display: { base: 'none', xsm: 'block' },
  },
})

const ButtonVerticalCenter = styled('div', {
  base: {
    marginTop: '13.3125rem',
    transform: 'translateY(-50%)',
  },
})

const SlideContainer = styled('div', {
  base: {
    alignItems: 'stretch',
    display: 'flex',
    position: 'relative',
  },
})

const Slide = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    justifyContent: 'start',
    minHeight: { base: 'none', xsm: '580px' },
    minWidth: { base: 'none', xsm: '200px' },
    width: { base: '100%', xsm: '22.625rem' },
  },
  variants: {
    visible: {
      true: {
        visibility: 'visible',
        position: 'static',
      },
      false: {
        visibility: 'hidden',
        position: 'absolute',
      },
    },
  },
  defaultVariants: {
    visible: false,
  },
})

const TextAnimation = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'center',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  variants: {
    visible: {
      true: {
        opacity: 1,
        transform: 'none',
        transition: 'opacity ease-in .3s, transform ease-in .3s',
      },
      false: {
        opacity: 0,
        transform: 'translateX(-30%)',
      },
    },
  },
})

type Slide = {
  key: string
  src: string
  isAvailableInBeta?: boolean
}

// todo - optimize how images are imported
const SLIDES: Slide[] = [
  {
    key: 'slide1',
    src: '/assets/intro-slider/1.png',
  },
  {
    key: 'slide2',
    src: '/assets/intro-slider/2.png',
  },
  {
    key: 'slide3',
    src: '/assets/intro-slider/3.png',
  },
]

export const IntroSlider = () => {
  const [slideIndex, setSlideIndex] = useState(0)
  const { t } = useTranslation('home', { keyPrefix: 'introSlider' })

  const { data } = useConfig()

  const filteredSlides = useMemo(
    () => (data?.transcript?.form_beta_users ? SLIDES : SLIDES.slice(0, 2)),
    [data]
  )

  const NUMBER_SLIDES = filteredSlides.length

  return (
    <Container>
      <div
        className={css({
          display: 'flex',
          flexGrow: 1,
          justifyContent: 'center',
        })}
      >
        <ButtonContainer>
          <ButtonVerticalCenter>
            <Button
              variant="secondaryText"
              square
              aria-label={t('previous.label')}
              tooltip={t('previous.tooltip')}
              onPress={() => setSlideIndex(slideIndex - 1)}
              isDisabled={slideIndex == 0}
            >
              <RiArrowLeftSLine />
            </Button>
          </ButtonVerticalCenter>
        </ButtonContainer>
        <SlideContainer>
          {filteredSlides.map((slide, index) => (
            <Slide visible={index == slideIndex} key={index}>
              <Image src={slide.src} alt={t(`${slide.key}.imgAlt`)} />
              <TextAnimation visible={index == slideIndex}>
                <Heading>{t(`${slide.key}.title`)}</Heading>
                <Body>{t(`${slide.key}.body`)}</Body>
                {slide.isAvailableInBeta && (
                  <LinkButton
                    href={data?.transcript.form_beta_users}
                    target="_blank"
                    tooltip={t('beta.tooltip')}
                    variant={'primary'}
                    size={'sm'}
                    style={{ marginTop: '1rem', width: 'fit-content' }}
                  >
                    {t('beta.text')}
                  </LinkButton>
                )}
              </TextAnimation>
            </Slide>
          ))}
        </SlideContainer>
        <ButtonContainer>
          <ButtonVerticalCenter>
            <Button
              variant="secondaryText"
              square
              aria-label={t('next.label')}
              tooltip={t('next.tooltip')}
              onPress={() => setSlideIndex(slideIndex + 1)}
              isDisabled={slideIndex == NUMBER_SLIDES - 1}
            >
              <RiArrowRightSLine />
            </Button>
          </ButtonVerticalCenter>
        </ButtonContainer>
      </div>
      <div
        className={css({
          marginTop: '0.5rem',
          display: { base: 'none', xsm: 'block' },
        })}
      >
        {filteredSlides.map((_, index) => (
          <Dot key={index} selected={index == slideIndex} />
        ))}
      </div>
    </Container>
  )
}
