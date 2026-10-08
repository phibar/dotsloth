import {useEffect, useState} from 'react'

import {ApiError, api, type Status} from './api.js'
import {DaemonPage} from './pages/daemon.js'
import {Dashboard} from './pages/dashboard.js'
import {Placeholder} from './pages/placeholder.js'
import {SECTIONS, type Section, useRoute} from './routes.js'
import {type Theme, useTheme} from './theme.js'

const THEMES: Theme[] = ['system', 'light', 'dark']

export function App() {
  const route = useRoute()
  const [theme, setTheme] = useTheme()
  const [status, setStatus] = useState<null | Status>(null)
  const [connection, setConnection] = useState<'error' | 'loading' | 'ok' | 'signed-out'>('loading')

  useEffect(() => {
    api
      .status()
      .then((result) => {
        setStatus(result)
        setConnection('ok')
      })
      .catch((error: unknown) =>
        setConnection(error instanceof ApiError && error.status === 401 ? 'signed-out' : 'error'),
      )
  }, [])

  const section = SECTIONS.find((s) => s.id === route) ?? SECTIONS[0]

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span aria-hidden="true">🦥</span> dotsloth
        </div>
        <nav aria-label="Sections">
          {SECTIONS.map((s) => (
            <a aria-current={s.id === section.id ? 'page' : undefined} href={`#/${s.id}`} key={s.id}>
              {s.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <label>
            Theme{' '}
            <select onChange={(e) => setTheme(e.target.value as Theme)} value={theme}>
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
      </aside>

      <main className="content">
        <header className="page-header">
          <h1>{section.label}</h1>
          <ConnectionBadge connection={connection} status={status} />
        </header>

        {connection === 'signed-out' ? (
          <section className="card">
            <p>
              This browser is not signed in. Open the link that <code>dotsloth ui</code> printed in your terminal.
            </p>
          </section>
        ) : (
          <Page section={section} />
        )}
      </main>
    </div>
  )
}

const PAGES: Record<string, () => React.JSX.Element> = {
  daemon: DaemonPage,
  dashboard: Dashboard,
}

function Page({section}: {section: Section}) {
  const Component = PAGES[section.id]
  return Component ? <Component /> : <Placeholder section={section} />
}

function ConnectionBadge({connection, status}: {connection: string; status: null | Status}) {
  if (connection === 'ok' && status) {
    const ok = status.icloud.accessible && !status.config.errors
    return (
      <span className={`badge ${ok ? 'badge-ok' : 'badge-warn'}`} title={status.config.path}>
        {ok ? 'Connected' : 'Needs attention'}
      </span>
    )
  }

  const labels: Record<string, string> = {
    error: 'Server unreachable',
    loading: 'Connecting…',
    'signed-out': 'Signed out',
  }
  return <span className={`badge ${connection === 'loading' ? '' : 'badge-error'}`}>{labels[connection]}</span>
}
