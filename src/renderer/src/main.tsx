import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

createRoot(container).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
