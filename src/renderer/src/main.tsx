import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import './signal.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

createRoot(container).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
