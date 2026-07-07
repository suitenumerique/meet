import { Component, type ReactNode } from 'react'

interface Props {
  fallback: ReactNode
  children: ReactNode
}

/**
 * Contains a plugin panel failure (lazy chunk 404 after a redeploy, or a render
 * error in third-party code) instead of letting it unmount the whole app.
 * Class component: error boundaries have no hook equivalent.
 */
export class PanelErrorBoundary extends Component<Props, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
