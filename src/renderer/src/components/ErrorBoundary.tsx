import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[TSTerm] renderer error', error, info)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="fatal-screen">
        <div className="fatal-card">
          <div className="fatal-icon">
            <AlertTriangle size={26} />
          </div>
          <h1>Something went wrong</h1>
          <p>
            TSTerm hit an unexpected error while rendering. Your saved hosts, settings, and device packs are safe.
          </p>
          <pre>{this.state.error.message}</pre>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            <RotateCcw size={15} /> Reload TSTerm
          </button>
        </div>
      </div>
    )
  }
}
