import {useEffect, useState} from 'react'

import {api, type ClaudeStatus, type HistoryPlan, type MemoryPlan, type SyncDirection} from '../api.js'
import {Button, Card, Dot, ErrorNote, type Tone, useLoad} from '../components/ui.js'
import {useToast} from '../toast.js'
import {useJob} from '../use-job.js'

const FILE_STATE: Record<ClaudeStatus['files'][number]['state'], {label: string; tone: Tone}> = {
  absent: {label: 'not present', tone: 'muted'},
  'local-only': {label: 'local only - not shared yet', tone: 'warn'},
  shared: {label: 'shared', tone: 'ok'},
  'store-only': {label: 'in the store, not linked here', tone: 'warn'},
}

export function ClaudePage() {
  return (
    <>
      <SettingsCard />
      <MemoryCard />
      <HistoryCard />
    </>
  )
}

function SettingsCard() {
  const toast = useToast()
  const status = useLoad(api.claude.status)
  const [busy, setBusy] = useState(false)

  if (status.error) return <ErrorNote error={status.error} />
  if (status.data && !status.data.installed) return <Card title="Settings">~/.claude not found.</Card>

  const link = async () => {
    setBusy(true)
    try {
      const events = await api.claude.link()
      const linked = events.filter((e) => e.type === 'linked' && e.result.isValid).length
      toast.success(`Linked ${linked} file(s)`)
      status.reload()
    } catch (error) {
      toast.error(error)
    } finally {
      setBusy(false)
    }
  }

  const needsLink = status.data?.files.some((f) => f.state === 'local-only' || f.state === 'store-only')

  return (
    <Card
      actions={
        <Button busy={busy} disabled={!needsLink} onClick={link} variant="primary">
          Link
        </Button>
      }
      title="Shared settings"
    >
      <ul className="steps">
        {status.data?.files.map((file) => (
          <li key={file.name}>
            <Dot tone={FILE_STATE[file.state].tone} /> <code>{file.name}</code>{' '}
            <span className="muted">{FILE_STATE[file.state].label}</span>
          </li>
        ))}
      </ul>
      <p className="muted small">Settings are symlinked. Memory and history are copied and merged below instead.</p>
    </Card>
  )
}

/** Shared shape of the memory and history cards: preview a direction, then apply it. */
function useSyncCard<P>(
  load: (direction: 'status' | SyncDirection) => Promise<P>,
  apply: (d: SyncDirection) => Promise<{id: string}>,
  /** Changing it reloads the plan, like changing the direction does. */
  reloadKey = '',
) {
  const toast = useToast()
  const [direction, setDirection] = useState<'status' | SyncDirection>('status')
  const [plan, setPlan] = useState<P | null>(null)
  const [jobId, setJobId] = useState<null | string>(null)
  const job = useJob(jobId)

  // Reload whenever the direction (or the caller's reload key) changes.
  useEffect(() => {
    load(direction).then(setPlan, (error: unknown) => toast.error(error))
  }, [direction, reloadKey])

  useEffect(() => {
    if (job.status === 'failed') toast.error(new Error(job.error?.message ?? 'Failed'))
    if (job.status === 'succeeded') {
      toast.success(direction === 'push' ? 'Pushed to the store' : 'Pulled from the store')
      setDirection('status')
      load('status').then(setPlan, (error: unknown) => toast.error(error))
    }
    // Only react to the job finishing.
  }, [job.status])

  const run = async () => {
    if (direction === 'status') return
    try {
      setJobId((await apply(direction)).id)
    } catch (error) {
      toast.error(error)
    }
  }

  const picker = (
    <>
      {(['status', 'push', 'pull'] as const).map((d) => (
        <Button key={d} onClick={() => setDirection(d)} variant={direction === d ? 'primary' : 'secondary'}>
          {{pull: 'Pull preview', push: 'Push preview', status: 'Status'}[d]}
        </Button>
      ))}
    </>
  )

  return {busy: job.status === 'running', direction, picker, plan, run}
}

function MemoryCard() {
  const card = useSyncCard<MemoryPlan>(api.claude.memoryPlan, api.jobs.claudeMemory)
  const plan = card.plan

  return (
    <Card actions={card.picker} title="Project memory">
      {plan && plan.projects.length === 0 && <p className="muted">All project memory is in sync.</p>}
      {plan?.projects.map((project) => (
        <div className="env-repo" key={project.key}>
          <h3>{project.key}</h3>
          <ul className="steps">
            {project.files.map((file) => (
              <li key={file.name}>
                <code>{file.name}</code> <span className="muted">{file.state}</span>
                {card.direction !== 'status' && (
                  <span className="muted">
                    {' '}
                    → {{copy: 'copy', merge: 'merge index', 'nothing-to-copy': 'nothing to copy'}[file.action]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {plan && plan.unkeyed > 0 && (
        <p className="muted small">{plan.unkeyed} project(s) skipped - no git remote to identify them across Macs.</p>
      )}
      {card.direction !== 'status' && (
        <div className="form-actions">
          <Button busy={card.busy} disabled={!plan?.changes} onClick={card.run} variant="primary">
            {card.direction === 'push' ? 'Push' : 'Pull'} {plan?.changes ?? 0} file(s)
          </Button>
        </div>
      )}
    </Card>
  )
}

function HistoryCard() {
  const [retention, setRetention] = useState(90)
  const card = useSyncCard<HistoryPlan>(
    (direction) => api.claude.historyPlan(direction, retention),
    (direction) => api.jobs.claudeHistory(direction, retention),
    String(retention),
  )
  const plan = card.plan

  return (
    <Card actions={card.picker} title="Conversation history">
      <label className="field narrow">
        Sessions touched within (days)
        <input min={1} onChange={(e) => setRetention(Number(e.target.value) || 1)} type="number" value={retention} />
      </label>
      {plan && (
        <ul className="steps">
          <li>
            {plan.sessionCount} session file(s) {card.direction === 'pull' ? 'to restore' : 'not in the store'}
          </li>
          <li>
            history.jsonl: {plan.log.localEntries} local + {plan.log.storeEntries} stored → {plan.log.mergedEntries}{' '}
            merged entries
          </li>
          {plan.skippedActive > 0 && (
            <li className="warn-text">{plan.skippedActive} skipped - still being written (like this session)</li>
          )}
          {plan.skippedOld > 0 && (
            <li className="muted">
              {plan.skippedOld} skipped - older than {plan.retentionDays} days
            </li>
          )}
        </ul>
      )}
      {card.direction !== 'status' && (
        <div className="form-actions">
          <Button busy={card.busy} onClick={card.run} variant="primary">
            {card.direction === 'push' ? 'Push' : 'Pull'} history
          </Button>
        </div>
      )}
    </Card>
  )
}
