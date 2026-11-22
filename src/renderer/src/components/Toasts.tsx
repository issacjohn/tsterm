import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useAppStore } from '../store'

const icons = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info
}

export function Toasts(): React.JSX.Element {
  const toasts = useAppStore((state) => state.toasts)
  const dismiss = useAppStore((state) => state.dismissToast)

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = icons[toast.kind]
        return (
          <div key={toast.id} className={`toast toast-${toast.kind}`}>
            <div className="toast-icon">
              <Icon size={16} />
            </div>
            <div className="toast-copy">
              <strong>{toast.title}</strong>
              {toast.message ? <span>{toast.message}</span> : null}
            </div>
            <button className="icon-btn tiny toast-close" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
