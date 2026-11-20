import { downloadBlob } from '@/utils/downloadBlob'
import type { ConnectionTestStepResult } from '../types'

export type ConnectionTestReport = {
  generatedAt: string
  userAgent: string
  steps: Record<
    string,
    {
      status: ConnectionTestStepResult['status']
      summary?: string
      logs?: ConnectionTestStepResult['logs']
      data?: ConnectionTestStepResult['data']
    }
  >
}

export const buildConnectionTestReport = (
  steps: ConnectionTestStepResult[]
): ConnectionTestReport => ({
  generatedAt: new Date().toISOString(),
  userAgent: navigator.userAgent,
  steps: Object.fromEntries(
    steps.map(({ id, status, summary, logs, data }) => [
      id,
      {
        status,
        ...(summary !== undefined ? { summary } : {}),
        ...(logs?.length ? { logs } : {}),
        ...(data !== undefined ? { data } : {}),
      },
    ])
  ),
})

export const downloadConnectionTestReport = (
  steps: ConnectionTestStepResult[]
) => {
  const report = buildConnectionTestReport(steps)
  const timestamp = report.generatedAt.slice(0, 19).replace(/:/g, '-')
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: 'application/json',
  })
  downloadBlob(blob, `connection-test-${timestamp}.json`)
}
