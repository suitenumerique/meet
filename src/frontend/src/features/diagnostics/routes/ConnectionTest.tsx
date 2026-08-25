import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  RiCloseLine,
  RiDownload2Line,
  RiErrorWarningLine,
  RiPlayLine,
} from '@remixicon/react'
import { CenteredContent } from '@/layout/CenteredContent'
import { Screen } from '@/layout/Screen'
import { Button } from '@/primitives'
import { css } from '@/styled-system/css'
import { Center, VStack } from '@/styled-system/jsx'
import { Permissions } from '@/features/rooms/components/Permissions'
import { useConnectionTestRunner } from '../hooks/useConnectionTestRunner'
import { isSuboptimalRoute } from '../checks/selectedCandidate'
import { ConnectionTestStepRow } from '../components/ConnectionTestStepRow'
import { ConnectionTestSummary } from '../components/ConnectionTestSummary'
import { CONNECTION_TEST_GROUPS, summarizeSteps } from '../types'
import { downloadConnectionTestReport } from '../utils/downloadConnectionTestReport'
import { useConfig } from '@/api/useConfig'
import { navigateTo } from '@/navigation/navigateTo'

const HIDE_LIVEKIT_VIDEO_CLASS = 'connection-test-hide-livekit-video'

const sectionClass = css({
  width: '100%',
  borderTop: '2px solid {colors.greyscale.900}',
  paddingTop: '1rem',
})

const sectionTitleClass = css({
  textStyle: 'h2',
  color: 'greyscale.1000',
  margin: 0,
})

const rowsClass = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  marginTop: '0.75rem',
})

const helpClass = css({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.5rem',
  width: '100%',
  borderRadius: 8,
  border: '1px solid {colors.greyscale.200}',
  backgroundColor: 'white',
  padding: '0.75rem 1rem',
  textStyle: 'sm',
  color: 'greyscale.800',
})

const helpIconClass = css({
  color: 'danger.600',
  flexShrink: 0,
  marginTop: '2px',
})

const ConnectionTest = () => {
  const { data, isLoading } = useConfig()
  const { t } = useTranslation('connectionTest')
  const { steps, isRunning, runTest, reset } = useConnectionTestRunner()

  const stats = useMemo(() => summarizeSteps(steps), [steps])
  const stepsById = useMemo(
    () => new Map(steps.map((step) => [step.id, step] as const)),
    [steps]
  )
  // The summary headline downgrades to a warning when media flows but over a
  // fallback route: TURN over TCP/TLS, or anything else that is not UDP.
  const routeWarning = useMemo(() => {
    const step = stepsById.get('selectedCandidate')
    return step?.status === 'success' && isSuboptimalRoute(step.data)
  }, [stepsById])

  const isPublishVideoRunning =
    stepsById.get('publishVideo')?.status === 'running'

  // LiveKit appends a bare <video> to document.body during publishVideo.
  // Keep it in the DOM (so the frame check still works) but hide it visually.
  useEffect(() => {
    document.body.classList.toggle(
      HIDE_LIVEKIT_VIDEO_CLASS,
      isPublishVideoRunning
    )
    return () => {
      document.body.classList.remove(HIDE_LIVEKIT_VIDEO_CLASS)
    }
  }, [isPublishVideoRunning])

  useEffect(() => {
    // Wait for config to load, otherwise we'd redirect off a page
    // that's actually enabled.
    if (!isLoading && !data?.diagnostics?.connection_test_enabled) {
      navigateTo('home', undefined, { replace: true })
    }
  }, [isLoading, data])

  return (
    <Screen layout="centered">
      <Permissions />
      <CenteredContent withBackButton>
        <Center>
          <VStack gap="1.5rem" maxWidth="40rem" width="100%">
            <ConnectionTestSummary
              stats={stats}
              isRunning={isRunning}
              routeWarning={routeWarning}
            >
              {isRunning ? (
                // A disabled "run" button while the test runs is dead weight:
                // cancelling is the only thing left to do.
                <Button
                  variant="secondary"
                  onPress={reset}
                  icon={<RiCloseLine size={18} aria-hidden="true" />}
                >
                  {t('cancel')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onPress={runTest}
                  icon={<RiPlayLine size={18} aria-hidden="true" />}
                >
                  {stats.hasStarted ? t('runAgain') : t('runTest')}
                </Button>
              )}
              {stats.hasStarted && !isRunning && (
                <Button
                  variant="secondary"
                  onPress={() => downloadConnectionTestReport(steps)}
                  icon={<RiDownload2Line size={18} aria-hidden="true" />}
                >
                  {t('downloadReport')}
                </Button>
              )}
            </ConnectionTestSummary>

            {stats.hasStarted &&
              CONNECTION_TEST_GROUPS.map((group) => (
                <section key={group.id} className={sectionClass}>
                  <h2 className={sectionTitleClass}>
                    {t(`groups.${group.id}`)}
                  </h2>
                  <div className={rowsClass}>
                    {group.steps.map((id) => {
                      const step = stepsById.get(id)
                      return step ? (
                        <ConnectionTestStepRow key={id} step={step} />
                      ) : null
                    })}
                  </div>
                </section>
              ))}

            {stats.failed > 0 && !isRunning && (
              <p className={helpClass}>
                <RiErrorWarningLine
                  size={18}
                  aria-hidden="true"
                  className={helpIconClass}
                />
                {t('help.firewall')}
              </p>
            )}
          </VStack>
        </Center>
      </CenteredContent>
    </Screen>
  )
}

export default ConnectionTest
