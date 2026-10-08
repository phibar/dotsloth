import {useState} from 'react'

import {api} from '../api.js'
import {Button, Card, ConfirmDialog, Dot, ErrorNote, useLoad} from '../components/ui.js'
import {useToast} from '../toast.js'
import {formatInterval} from './dashboard.js'

const PRESETS = [3600, 6 * 3600, 12 * 3600, 86_400]

function describeState(d: {installed: boolean; loaded: boolean}): string {
  if (!d.installed) return 'Not installed'
  return d.loaded ? 'Installed and loaded in launchd' : 'Installed, but NOT loaded in launchd'
}

export function DaemonPage() {
  const toast = useToast()
  const daemon = useLoad(api.daemon.get)
  const [interval, setChosenInterval] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  if (daemon.error) return <ErrorNote error={daemon.error} />
  const d = daemon.data
  if (!d) return <p className="muted">Loading…</p>

  const chosen = interval ?? d.intervalSeconds ?? 86_400

  const install = async () => {
    setBusy(true)
    try {
      const result = await api.daemon.install(chosen)
      if (result.nodeWarning?.kind === 'version-managed') {
        toast.error(new Error('node is version-managed: the agent will stop after your next node upgrade'))
      } else {
        toast.success(`Periodic sync every ${formatInterval(chosen)}`)
      }

      daemon.reload()
    } catch (error) {
      toast.error(error)
    } finally {
      setBusy(false)
    }
  }

  const uninstall = async () => {
    setConfirming(false)
    setBusy(true)
    try {
      await api.daemon.uninstall()
      toast.success('Periodic sync removed')
      daemon.reload()
    } catch (error) {
      toast.error(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card title="Status">
        <p>
          <Dot tone={d.loaded ? 'ok' : 'warn'} /> {describeState(d)}
        </p>
        {d.installed && (
          <dl className="facts">
            <dt>Interval</dt>
            <dd>{d.intervalSeconds ? `every ${formatInterval(d.intervalSeconds)}` : 'unknown'}</dd>
            <dt>Plist</dt>
            <dd>
              <code>{d.plistPath}</code>
            </dd>
            <dt>Log</dt>
            <dd>
              <code>{d.logPath}</code>
            </dd>
          </dl>
        )}
      </Card>

      <Card
        actions={
          <>
            {d.installed && (
              <Button busy={busy} onClick={() => setConfirming(true)} variant="danger">
                Uninstall
              </Button>
            )}
            <Button busy={busy} onClick={install} variant="primary">
              {d.installed ? 'Update' : 'Install'}
            </Button>
          </>
        }
        title="Schedule"
      >
        <fieldset className="choices">
          <legend className="muted">Run dotsloth sync every</legend>
          {PRESETS.map((seconds) => (
            <label className="inline" key={seconds}>
              <input
                checked={chosen === seconds}
                name="interval"
                onChange={() => setChosenInterval(seconds)}
                type="radio"
              />{' '}
              {formatInterval(seconds)}
            </label>
          ))}
        </fieldset>
      </Card>

      {d.recentLog.length > 0 && (
        <Card title="Last run">
          <pre className="log">{d.recentLog.join('\n')}</pre>
        </Card>
      )}

      {confirming && (
        <ConfirmDialog
          confirmLabel="Uninstall"
          message="dotsloth will no longer sync in the background. You can reinstall it at any time."
          onCancel={() => setConfirming(false)}
          onConfirm={uninstall}
          title="Remove periodic sync?"
        />
      )}
    </>
  )
}
