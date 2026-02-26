import { styled } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { Button } from '@/primitives'
import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  const prevButtonRef = useRef<HTMLButtonElement>(null)
  const nextButtonRef = useRef<HTMLButtonElement>(null)
  const focusTargetRef = useRef<'prev' | 'next' | null>(null)
  const { t } = useTranslation('home', { keyPrefix: 'introSlider' })

  const NUMBER_SLIDES = SLIDES.length

  const prevSlideIndex = slideIndex - 1
  const nextSlideIndex = slideIndex + 1

  const previousAriaLabel =
    slideIndex > 0
      ? t('previous.withPosition', {
          target: prevSlideIndex + 1,
          total: NUMBER_SLIDES,
        })
      : t('previous.label')
  const nextAriaLabel =
    slideIndex < NUMBER_SLIDES - 1
      ? t('next.withPosition', {
          target: nextSlideIndex + 1,
          total: NUMBER_SLIDES,
        })
      : t('next.label')

  return (
    <Container
      role="region"
      aria-roledescription="carousel"
      aria-label={t('carouselLabel')}
    >
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
              ref={prevButtonRef}
              variant="secondaryText"
              square
              className="carousel-nav-button"
              aria-label={previousAriaLabel}
              onPress={() => {
                focusTargetRef.current = 'prev'
                setSlideIndex(prevSlideIndex)
              }}
              isDisabled={slideIndex == 0}
            >
              <RiArrowLeftSLine />
            </Button>
          </ButtonVerticalCenter>
        </ButtonContainer>
        <SlideContainer>
          {SLIDES.map((slide, index) => (
            <Slide visible={index == slideIndex} key={index}>
              <Image src={slide.src} alt="" role="presentation" />
              <TextAnimation visible={index == slideIndex}>
                <Heading>{t(`${slide.key}.title`)}</Heading>
                <Body>{t(`${slide.key}.body`)}</Body>
              </TextAnimation>
            </Slide>
          ))}
        </SlideContainer>
        <ButtonContainer>
          <ButtonVerticalCenter>
            <Button
              ref={nextButtonRef}
              variant="secondaryText"
              square
              className="carousel-nav-button"
              aria-label={nextAriaLabel}
              onPress={() => {
                focusTargetRef.current = 'next'
                setSlideIndex(nextSlideIndex)
              }}
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
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="sr-only">
          {t('slidePosition', {
            current: slideIndex + 1,
            total: NUMBER_SLIDES,
          })}
        </span>
          {SLIDES.map((_, index) => (
            <Dot key={index} selected={index == slideIndex} />
          ))}
      </div>
    </Container>
  )
}
