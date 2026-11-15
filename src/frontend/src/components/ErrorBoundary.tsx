import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '@/features/analytics/telemetry'

type ErrorBoundaryProps = {
  // Identifies in analytics which part of the app raised the error.
  id: string
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: unknown) => void
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    reportError('error_boundary_failure', error, {
      boundary_id: this.props.id,
      component_stack: info.componentStack,
    })
    this.props.onError?.(error)
  }

  render() {
    return this.state.hasError
      ? (this.props.fallback ?? null)
      : this.props.children
  }
}
