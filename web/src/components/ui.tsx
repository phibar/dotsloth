import {type ButtonHTMLAttributes, type ReactNode, useCallback, useEffect, useState} from 'react'

export function Button({
  busy = false,
  children,
  variant = 'secondary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {busy?: boolean; variant?: 'danger' | 'primary' | 'secondary'}) {
  return (
    <button className={`button button-${variant}`} disabled={busy || props.disabled} type="button" {...props}>
      {busy && <span aria-hidden="true" className="spinner" />}
      {children}
    </button>
  )
}

export type Tone = 'error' | 'muted' | 'ok' | 'warn'

export function Dot({label, tone}: {label?: string; tone: Tone}) {
  return <span aria-label={label} className={`dot dot-${tone}`} role={label ? 'img' : undefined} />
}

export function Card({actions, children, title}: {actions?: ReactNode; children: ReactNode; title?: ReactNode}) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-header">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * Asks before something irreversible. With `confirmText`, the user has to
 * type it (an org name, say) - for actions that delete data.
 */
export function ConfirmDialog({
  confirmLabel,
  confirmText,
  message,
  onCancel,
  onConfirm,
  title,
}: {
  confirmLabel: string
  confirmText?: string
  message: ReactNode
  onCancel: () => void
  onConfirm: () => void
  title: string
}) {
  const [typed, setTyped] = useState('')
  const ready = !confirmText || typed === confirmText

  return (
    <div className="dialog-backdrop">
      <div aria-labelledby="dialog-title" aria-modal="true" className="dialog" role="dialog">
        <h2 id="dialog-title">{title}</h2>
        <div>{message}</div>
        {confirmText && (
          <label className="field">
            Type <code>{confirmText}</code> to confirm
            <input autoFocus onChange={(e) => setTyped(e.target.value)} value={typed} />
          </label>
        )}
        <div className="dialog-actions">
          <Button onClick={onCancel}>Cancel</Button>
          <Button disabled={!ready} onClick={onConfirm} variant="danger">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export interface Loaded<T> {
  data?: T
  error?: unknown
  loading: boolean
  reload: () => void
}

/** Load data on mount and on reload(); keeps the previous data while reloading. */
export function useLoad<T>(load: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<{data?: T; error?: unknown; loading: boolean}>({loading: true})
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let current = true
    setState((s) => ({...s, loading: true}))
    load().then(
      (data) => current && setState({data, loading: false}),
      (error: unknown) => current && setState((s) => ({...s, error, loading: false})),
    )
    return () => {
      current = false
    }
    // Deliberately keyed on `version` only: reload() bumps it, and `load` may be a new function each render.
  }, [version])

  return {...state, reload: useCallback(() => setVersion((v) => v + 1), [])}
}

export function ErrorNote({error}: {error: unknown}) {
  return <p className="error-text">{error instanceof Error ? error.message : String(error)}</p>
}
