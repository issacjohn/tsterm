import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ModalProps {
  title: string
  description?: string
  icon?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  dismissible?: boolean
  className?: string
}

export function Modal({
  title,
  description,
  icon,
  size = 'md',
  onClose,
  children,
  footer,
  dismissible = true,
  className
}: ModalProps): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useRef(`modal-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    if (panel) {
      const target =
        panel.querySelector<HTMLElement>('[data-autofocus]') ??
        panel.querySelector<HTMLElement>('input, textarea, select, button')
      window.setTimeout(() => target?.focus(), 30)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const focusable = [
        ...panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ].filter((element) => element.offsetParent !== null)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previous?.focus()
    }
  }, [dismissible, onClose])

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className={`modal-panel modal-${size}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
      >
        <header className="modal-header">
          {icon ? <div className="modal-icon">{icon}</div> : null}
          <div className="modal-heading">
            <h2 id={titleId.current}>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          {dismissible ? (
            <button className="icon-btn modal-close" onClick={onClose} aria-label="Close dialog">
              <X size={18} />
            </button>
          ) : null}
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  )
}
