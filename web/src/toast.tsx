import {createContext, type ReactNode, useCallback, useContext, useMemo, useState} from 'react'

import {ApiError} from './api.js'

export interface Toast {
  details: string[]
  id: number
  kind: 'error' | 'success'
  message: string
}

interface ToastApi {
  error: (error: unknown) => void
  success: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

let nextId = 0

export function ToastProvider({children}: {children: ReactNode}) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId++
      setToasts((all) => [...all, {...toast, id}])
      if (toast.kind === 'success') setTimeout(() => dismiss(id), 4000)
    },
    [dismiss],
  )

  const value = useMemo<ToastApi>(
    () => ({
      error(error) {
        const details = error instanceof ApiError ? error.details : []
        push({details, kind: 'error', message: error instanceof Error ? error.message : String(error)})
      },
      success: (message) => push({details: [], kind: 'success', message}),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="toasts">
        {toasts.map((toast) => (
          <div
            className={`toast toast-${toast.kind}`}
            key={toast.id}
            role={toast.kind === 'error' ? 'alert' : 'status'}
          >
            <div>
              <strong>{toast.message}</strong>
              {toast.details.length > 0 && (
                <ul>
                  {toast.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
            <button aria-label="Dismiss" className="toast-close" onClick={() => dismiss(toast.id)} type="button">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast needs a ToastProvider')
  return api
}
