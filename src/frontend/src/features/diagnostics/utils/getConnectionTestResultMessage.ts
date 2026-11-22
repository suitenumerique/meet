import type { TFunction } from 'i18next'
import type { ConnectionTestStats } from '../types'

/**
 * One sentence carrying the whole result, for assistive technologies:
 * "Check complete: 9 passed, 1 skipped, 1 failed (Camera)."
 *
 * Mirrors the visual counters, which a screen reader does not announce on its
 * own. Empty categories are left out to keep the announcement short.
 */
export const getConnectionTestResultMessage = (
  t: TFunction<'connectionTest'>,
  stats: Pick<
    ConnectionTestStats,
    'passed' | 'warnings' | 'skipped' | 'failed' | 'failedSteps'
  >
) => {
  const results: string[] = []

  if (stats.passed > 0) {
    results.push(t('results.passed', { count: stats.passed }))
  }
  if (stats.warnings > 0) {
    results.push(t('results.warnings', { count: stats.warnings }))
  }
  if (stats.skipped > 0) {
    results.push(t('results.skipped', { count: stats.skipped }))
  }
  if (stats.failed > 0) {
    results.push(
      t('results.failed', {
        count: stats.failed,
        steps: stats.failedSteps.map((id) => t(`steps.${id}`)).join(', '),
      })
    )
  }

  return t('results.complete', { results: results.join(', ') })
}
