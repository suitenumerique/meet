import { useTranslation } from 'react-i18next'
import { Button } from '@/primitives'
import { Screen } from '@/layout/Screen'
import { Center, Stack, styled, VStack } from '@/styled-system/jsx'
import { css } from '@/styled-system/css'
import { Rating } from '@/features/rooms/components/Rating.tsx'
import { useLocation } from 'wouter'
import { useMemo } from 'react'
import { DisconnectReason } from 'livekit-client'

// fixme - duplicated with home, refactor in a proper style
const Heading = styled('h1', {
  base: {
    fontWeight: '500',
    fontStyle: 'normal',
    fontStretch: 'normal',
    fontOpticalSizing: 'auto',
    fontSize: { base: '1.75rem', xsm: '2.3rem' },
    lineHeight: { base: '2.125rem', xsm: '2.5rem' },
    letterSpacing: '0',
    paddingBottom: { base: '1.5rem', xsm: '2rem' },
    textAlign: 'center',
  },
})

const buttonClass = css({
  width: { base: '100%', xsm: 'auto' },
})

enum DisconnectReasonKey {
  DuplicateIdentity = 'duplicateIdentity',
  ParticipantRemoved = 'participantRemoved',
}

const FeedbackRoute = () => {
  const { t } = useTranslation('rooms')
  const [, setLocation] = useLocation()

  const reasonKey = useMemo(() => {
    const state = window.history.state

    if (!state?.reason) return
    switch (state.reason) {
      case DisconnectReason.DUPLICATE_IDENTITY:
        return DisconnectReasonKey.DuplicateIdentity
      case DisconnectReason.PARTICIPANT_REMOVED:
        return DisconnectReasonKey.ParticipantRemoved
    }
  }, [])

  const metadata = useMemo(() => {
    const state = window.history.state
    return {
      room_id: state?.room_id as string,
    }
  }, [])

  const showBackButton = reasonKey !== DisconnectReasonKey.ParticipantRemoved

  return (
    <Screen layout="centered" footer={false}>
      <Center width="100%">
        <VStack width="100%" paddingX="1rem">
          <Heading>{t(`feedback.heading.${reasonKey || 'normal'}`)}</Heading>
          <Stack
            direction={{ base: 'column', xsm: 'row' }}
            width={{ base: '100%', xsm: 'auto' }}
            maxWidth="380px"
          >
            {showBackButton && (
              <Button
                variant="secondary"
                className={buttonClass}
                onPress={() => window.history.back()}
              >
                {t('feedback.back')}
              </Button>
            )}
            <Button
              variant="primary"
              className={buttonClass}
              onPress={() => setLocation('/')}
            >
              {t('feedback.home')}
            </Button>
          </Stack>
          <Rating metadata={metadata} />
        </VStack>
      </Center>
    </Screen>
  )
}

export default FeedbackRoute
