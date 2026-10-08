import {useCallback} from 'react'

import {api} from '../api.js'
import {SyncPanel} from '../components/sync-panel.js'
import {Card, Dot, ErrorNote, type Tone, useLoad} from '../components/ui.js'

function Stat({detail, label, tone, value}: {detail?: string; label: string; tone: Tone; value: string}) {
  return (
    <div className="stat">
      <div className="stat-label">
        <Dot tone={tone} /> {label}
      </div>
      <div className="stat-value">{value}</div>
      {detail && <div className="stat-detail muted">{detail}</div>}
    </div>
  )
}

export function Dashboard() {
  const status = useLoad(api.status)
  const daemon = useLoad(api.daemon.get)
  const reload = useCallback(() => {
    status.reload()
    daemon.reload()
  }, [status.reload, daemon.reload])

  if (status.error) return <ErrorNote error={status.error} />
  const s = status.data
  if (!s) return <p className="muted">Loading…</p>

  const config = s.config.value
  const brokenLinks = s.symlinks.filter((l) => !l.isValid)
  let configTone: Tone = 'ok'
  let configValue = 'Found'
  if (s.config.errors) {
    configTone = 'error'
    configValue = 'Invalid'
  } else if (!s.config.exists) {
    configTone = 'warn'
    configValue = 'Missing'
  }

  return (
    <>
      <div className="stats">
        <Stat
          detail={s.icloud.path}
          label="iCloud Drive"
          tone={s.icloud.accessible ? 'ok' : 'error'}
          value={s.icloud.accessible ? 'Accessible' : 'Not accessible'}
        />
        <Stat
          detail={s.config.errors?.[0] ?? s.config.path}
          label="Configuration"
          tone={configTone}
          value={configValue}
        />
        <Stat
          detail={config?.organizations.map((o) => o.name).join(', ')}
          label="Organizations"
          tone={config?.organizations.length ? 'ok' : 'warn'}
          value={String(config?.organizations.length ?? 0)}
        />
        <Stat
          detail={brokenLinks.map((l) => l.target).join(', ') || undefined}
          label="Symlinks"
          tone={brokenLinks.length > 0 ? 'warn' : 'ok'}
          value={`${s.symlinks.length - brokenLinks.length} / ${s.symlinks.length} linked`}
        />
        <Stat label="SSH keys in agent" tone={s.sshKeys.length > 0 ? 'ok' : 'warn'} value={String(s.sshKeys.length)} />
        <Stat label="Secrets in Keychain" tone="muted" value={String(s.secrets.names.length)} />
        <Stat
          detail={daemon.data?.intervalSeconds ? `every ${formatInterval(daemon.data.intervalSeconds)}` : undefined}
          label="Periodic sync"
          tone={daemon.data?.loaded ? 'ok' : 'warn'}
          value={daemonLabel(daemon.data)}
        />
      </div>

      {config && <SyncPanel onDone={reload} />}

      {brokenLinks.length > 0 && (
        <Card title="Symlinks that need attention">
          <ul className="steps">
            {brokenLinks.map((link) => (
              <li key={link.target}>
                <Dot tone={link.exists ? 'warn' : 'error'} /> {link.target}
                <span className="muted"> — {link.error ?? 'not set up'}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}

function daemonLabel(daemon: undefined | {installed: boolean; loaded: boolean}): string {
  if (!daemon) return '…'
  if (!daemon.installed) return 'Not installed'
  return daemon.loaded ? 'Running' : 'Installed, not loaded'
}

export function formatInterval(seconds: number): string {
  if (seconds % 86_400 === 0) return seconds === 86_400 ? 'day' : `${seconds / 86_400} days`
  if (seconds % 3600 === 0) return seconds === 3600 ? 'hour' : `${seconds / 3600} hours`
  return `${Math.round(seconds / 60)} min`
}
