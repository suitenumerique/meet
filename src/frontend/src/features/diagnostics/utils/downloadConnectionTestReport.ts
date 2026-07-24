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
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `connection-test-${timestamp}.json`
  // Firefox only follows the click when the anchor is in the document, and
  // revoking the URL in the same tick cancels the download in some browsers.
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
