import { styled } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { Button } from '@/primitives'
import { RiArrowLeftSLine, RiArrowRightSLine } from '@remixicon/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'

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

const carouselNavButton = css({
  _focusVisible: {
    outline: '2px solid var(--colors-focus-ring) !important',
    outlineOffset: '1px',
  },
  _disabled: {
    color: 'greyscale.400',
    cursor: 'default',
    pointerEvents: 'none',
    _pressed: {
      backgroundColor: 'transparent',
    },
  },
})

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
  const announce = useScreenReaderAnnounce()

  const NUMBER_SLIDES = SLIDES.length

  const goPrev = () => {
    if (slideIndex === 0) return
    const newIndex = slideIndex - 1
    setSlideIndex(newIndex)
    announce(
      t('slidePosition', { current: newIndex + 1, total: NUMBER_SLIDES }),
      'polite',
      'global'
    )
  }

  const goNext = () => {
    if (slideIndex === NUMBER_SLIDES - 1) return
    const newIndex = slideIndex + 1
    setSlideIndex(newIndex)
    announce(
      t('slidePosition', { current: newIndex + 1, total: NUMBER_SLIDES }),
      'polite',
      'global'
    )
  }

  const ariaLabelParams = {
    current: slideIndex + 1,
    total: NUMBER_SLIDES,
  }
  const previousAriaLabel = t('previous.labelWithPosition', ariaLabelParams)
  const nextAriaLabel = t('next.labelWithPosition', ariaLabelParams)

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
              variant="secondaryText"
              square
              className={carouselNavButton}
              aria-label={previousAriaLabel}
              aria-disabled={slideIndex === 0}
              onPress={goPrev}
            >
              <RiArrowLeftSLine />
            </Button>
          </ButtonVerticalCenter>
        </ButtonContainer>
        <SlideContainer>
          {SLIDES.map((slide, index) => (
            <Slide
              aria-hidden={index !== slideIndex}
              visible={index === slideIndex}
              key={index}
            >
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
              variant="secondaryText"
              square
              className={carouselNavButton}
              aria-label={nextAriaLabel}
              aria-disabled={slideIndex === NUMBER_SLIDES - 1}
              onPress={goNext}
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
        {SLIDES.map((_, index) => (
          <Dot key={index} selected={index == slideIndex} />
        ))}
      </div>
    </Container>
  )
}
