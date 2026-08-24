import { Button, H, Text, TextArea } from '@/primitives'
import { useEffect, useMemo, useState } from 'react'
import { cva } from '@/styled-system/css'
import { useTranslation } from 'react-i18next'
import { styled, VStack } from '@/styled-system/jsx'
import { Button as RACButton } from 'react-aria-components'
import { useIsAnalyticsEnabled } from '@/features/analytics/hooks/useIsAnalyticsEnabled'
import { captureEvent } from '@/features/analytics/telemetry'

const Card = styled('div', {
  base: {
    border: '1px solid',
    borderColor: 'gray.300',
    padding: '1rem',
    marginTop: '1.5rem',
    borderRadius: '0.25rem',
    boxShadow: '',
    width: '100%',
    maxWidth: '380px',
    minHeight: '196px',
  },
})

const Bar = styled('div', {
  base: {
    display: 'flex',
    border: '2px solid',
    borderColor: 'gray.300',
    borderRadius: '8px',
    overflowY: 'hidden',
    scrollbar: 'hidden',
  },
})

const ratingButtonRecipe = cva({
  base: {
    backgroundColor: 'white',
    color: 'initial',
    border: 'none',
    borderRadius: 0,
    padding: { base: '0.5rem 0.25rem', xsm: '0.5rem 0.85rem' },
    flexGrow: '1',
    flexBasis: 0,
    minWidth: 0,
    textAlign: 'center',
    cursor: 'pointer',
  },
  variants: {
    selected: {
      true: {
        backgroundColor: 'primary.800',
        color: 'white',
      },
      false: {
        '&[data-hovered]': {
          backgroundColor: 'gray.100',
        },
      },
    },
    borderLeft: {
      true: {
        borderLeft: '1px solid',
        borderColor: 'gray.300',
      },
    },
  },
})

const labelRecipe = cva({
  base: {
    color: 'gray.600',
    paddingTop: '0.25rem',
  },
})

const OpenFeedback = ({
  onNext,
  metadata,
}: {
  onNext: () => void
  metadata?: Record<string, unknown>
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'openFeedback' })
  const [feedback, setFeedback] = useState('')

  const onContinue = () => {
    setFeedback('')
    onNext()
  }

  const onSubmit = () => {
    try {
      captureEvent('open-feedback', {
        feedback,
        ...metadata,
      })
    } catch (e) {
      console.warn(e)
    } finally {
      onContinue()
    }
  }

  return (
    <Card>
      <H lvl={3} centered>
        {t('question')}
      </H>
      <TextArea
        id="feedbackInput"
        name="feedback"
        placeholder={t('placeholder')}
        required
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        style={{
          minHeight: '150px',
          marginBottom: '1rem',
        }}
      />
      <VStack gap="0.5">
        <Button
          variant="primary"
          size="sm"
          fullWidth
          isDisabled={!feedback}
          onPress={onSubmit}
        >
          {t('submit')}
        </Button>
        <Button
          invisible
          variant="secondary"
          size="sm"
          fullWidth
          onPress={onNext}
        >
          {t('skip')}
        </Button>
      </VStack>
    </Card>
  )
}

const RateQuality = ({
  onNext,
  metadata,
  maxRating = 5,
}: {
  onNext: () => void
  metadata?: Record<string, unknown>
  maxRating?: number
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'rating' })
  const [selectedRating, setSelectedRating] = useState<number | null>(null)

  const handleRatingClick = (rating: number) => {
    setSelectedRating((prevRating) => (prevRating === rating ? null : rating))
  }

  const onSubmit = () => {
    try {
      captureEvent('quality-rating', {
        rating: selectedRating,
        ...metadata,
      })
    } catch (e) {
      console.warn(e)
    } finally {
      setSelectedRating(null)
      onNext()
    }
  }

  return (
    <Card>
      <H lvl={3} centered>
        {t('question')}
      </H>
      <Bar>
        {[...Array(maxRating)].map((_, index) => (
          <RACButton
            key={index}
            onPress={() => handleRatingClick(index + 1)}
            className={ratingButtonRecipe({
              selected: selectedRating === index + 1,
              borderLeft: index != 0,
            })}
          >
            {index + 1}
          </RACButton>
        ))}
      </Bar>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '1rem',
        }}
      >
        <Text variant="sm" className={labelRecipe()}>
          {t('levels.min')}
        </Text>
        <Text variant="sm" className={labelRecipe()}>
          {t('levels.max')}
        </Text>
      </div>
      <Button
        variant="primary"
        size="sm"
        fullWidth
        isDisabled={!selectedRating}
        onPress={onSubmit}
      >
        {t('submit')}
      </Button>
    </Card>
  )
}

const ConfirmationMessage = ({ onNext }: { onNext: () => void }) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'confirmationMessage' })
  useEffect(() => {
    const timer = setTimeout(() => {
      onNext()
    }, 10000)
    return () => clearTimeout(timer)
  }, [onNext])
  return (
    <Card
      style={{
        maxWidth: '380px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <VStack gap={0}>
        <H lvl={3} centered>
          {t('heading')}
        </H>
        <Text as="p" variant="paragraph" centered>
          {t('body')}
        </Text>
      </VStack>
    </Card>
  )
}

type RatingMetadata = {
  room_id?: string
}

export const Rating = ({
  metadata: metadataProp,
}: {
  metadata: RatingMetadata
}) => {
  const isAnalyticsEnabled = useIsAnalyticsEnabled()
  const [step, setStep] = useState(0)

  const sessionId = useMemo(() => crypto.randomUUID(), [])

  const metadata = useMemo(
    () => ({
      session_id: sessionId,
      ...metadataProp,
    }),
    [sessionId, metadataProp]
  )

  if (!isAnalyticsEnabled) return

  if (step == 0) {
    return <RateQuality onNext={() => setStep(step + 1)} metadata={metadata} />
  }

  if (step == 1) {
    return <OpenFeedback onNext={() => setStep(step + 1)} metadata={metadata} />
  }

  if (step == 2) {
    return <ConfirmationMessage onNext={() => setStep(0)} />
  }
}
