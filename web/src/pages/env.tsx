import {useEffect, useState} from 'react'

import {api, type EnvEntry, type EnvTransferResult} from '../api.js'
import {Button, Card, Dot, ErrorNote, type Tone, useLoad} from '../components/ui.js'
import {useToast} from '../toast.js'
import {useJob} from '../use-job.js'

const STATE: Record<EnvEntry['state'], {label: string; tone: Tone}> = {
  differs: {label: 'differs', tone: 'warn'},
  identical: {label: 'in sync', tone: 'ok'},
  'local-only': {label: 'not backed up', tone: 'error'},
  'store-only': {label: 'store only', tone: 'muted'},
}

type Direction = 'pull' | 'push'

export function EnvPage() {
  const scan = useLoad(api.env.scan)

  if (scan.error) return <ErrorNote error={scan.error} />
  const entries = scan.data?.entries ?? []
  const byRepo = new Map<string, EnvEntry[]>()
  for (const entry of entries) {
    const repo = `${entry.org}/${entry.repo}`
    byRepo.set(repo, [...(byRepo.get(repo) ?? []), entry])
  }
  const unsaved = entries.filter((e) => e.state === 'local-only').length

  return (
    <>
      <Card title="Env files">
        <p className="muted">
          Only locations and states are shown here - file contents never leave this machine through the web UI.
        </p>
        {scan.data && entries.length === 0 && <p className="muted">No env files found under {scan.data.githubRoot}.</p>}
        {unsaved > 0 && (
          <p>
            <Dot tone="error" /> {unsaved} file(s) are not backed up.
          </p>
        )}
        {[...byRepo].map(([repo, files]) => (
          <div className="env-repo" key={repo}>
            <h3>{repo}</h3>
            <ul className="steps">
              {files.map((file) => (
                <li key={file.key}>
                  <Dot tone={STATE[file.state].tone} /> <code>{file.relativePath}</code>{' '}
                  <span className="muted">{STATE[file.state].label}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Card>

      <Transfer direction="push" onDone={scan.reload} />
      <Transfer direction="pull" onDone={scan.reload} />
    </>
  )
}

const TEXT = {
  pull: {action: 'Restore', conflict: 'local file differs from the store', title: 'Restore from the store'},
  push: {
    action: 'Back up',
    conflict: 'store copy differs - maybe newer work from another Mac',
    title: 'Back up to the store',
  },
}

/** Dry run first; then apply, overwriting only the conflicts that were ticked. */
function Transfer({direction, onDone}: {direction: Direction; onDone: () => void}) {
  const toast = useToast()
  const [jobId, setJobId] = useState<null | string>(null)
  const [preview, setPreview] = useState<EnvTransferResult | null>(null)
  const [force, setForce] = useState<string[]>([])
  const [applying, setApplying] = useState(false)
  const job = useJob<never, EnvTransferResult>(jobId)
  const text = TEXT[direction]

  useEffect(() => {
    if (job.status === 'failed') toast.error(new Error(job.error?.message ?? 'Failed'))
    if (job.status !== 'succeeded' || !job.result) return
    if (applying) {
      toast.success(`${job.result.copied} file(s) copied`)
      setPreview(null)
      setApplying(false)
      onDone()
    } else {
      setPreview(job.result)
      setForce([])
    }
  }, [job.status, job.result, job.error, applying, onDone, toast])

  const run = async (dryRun: boolean) => {
    setApplying(!dryRun)
    try {
      const options = {dryRun, force}
      setJobId((direction === 'push' ? await api.jobs.envPush(options) : await api.jobs.envPull(options)).id)
    } catch (error) {
      toast.error(error)
    }
  }

  const toggle = (key: string) => setForce((all) => (all.includes(key) ? all.filter((k) => k !== key) : [...all, key]))
  const willCopy = (preview?.transfers.filter((t) => t.outcome === 'would-copy').length ?? 0) + force.length

  return (
    <Card
      actions={
        <Button busy={job.status === 'running' && !applying} onClick={() => run(true)}>
          Preview
        </Button>
      }
      title={text.title}
    >
      {preview && preview.transfers.length === 0 && <p className="muted">Nothing to do - everything is in sync.</p>}
      {preview && preview.transfers.length > 0 && (
        <>
          <ul className="steps">
            {preview.transfers.map((t) => (
              <li key={t.key}>
                {t.outcome === 'conflict' ? (
                  <label className="inline">
                    <input checked={force.includes(t.key)} onChange={() => toggle(t.key)} type="checkbox" />{' '}
                    <code>{t.key}</code>
                    <span className="warn-text small">{text.conflict} - tick to overwrite</span>
                  </label>
                ) : (
                  <>
                    <Dot tone={t.outcome === 'would-copy' ? 'ok' : 'muted'} /> <code>{t.key}</code>{' '}
                    <span className="muted">
                      {t.outcome === 'would-copy' ? 'will be copied' : 'repo not cloned - skipped'}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="form-actions">
            <Button
              busy={job.status === 'running' && applying}
              disabled={willCopy === 0}
              onClick={() => run(false)}
              variant="primary"
            >
              {text.action} {willCopy} file(s)
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
