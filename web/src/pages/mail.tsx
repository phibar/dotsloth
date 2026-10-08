import {useEffect, useState} from 'react'

import {api, type MailEvent, type MailExportResult, type MailRestorePlan, type MailStatus} from '../api.js'
import {Button, Card, Dot, type Tone} from '../components/ui.js'
import {useToast} from '../toast.js'
import {useJob} from '../use-job.js'

const AUTOMATION_NOTE =
  'This talks to Mail via AppleScript. The first time, macOS asks whether dotsloth may control Mail - allow it.'

export function MailPage() {
  return (
    <>
      <StatusCard />
      <ExportCard />
      <RestoreCard />
    </>
  )
}

/** Loaded on request only: every read drives Mail. */
function StatusCard() {
  const toast = useToast()
  const [status, setStatus] = useState<MailStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const check = async () => {
    setBusy(true)
    try {
      setStatus(await api.mail.status())
    } catch (error) {
      toast.error(error)
    } finally {
      setBusy(false)
    }
  }

  const row = (label: string, local?: number, stored?: number) => (
    <tr key={label}>
      <td>{label}</td>
      <td>{local ?? '—'}</td>
      <td>{stored ?? '—'}</td>
      <td>
        <Dot tone={local === stored ? 'ok' : 'warn'} />
      </td>
    </tr>
  )

  return (
    <Card
      actions={
        <Button busy={busy} onClick={check}>
          Compare with Mail
        </Button>
      }
      title="Mail on this Mac vs. the store"
    >
      <p className="muted small">{AUTOMATION_NOTE}</p>
      {status && !status.exported && <p>Nothing exported yet.</p>}
      {status?.exported && (
        <>
          <p className="muted small">Exported {new Date(status.exported.exportedAt).toLocaleString()}</p>
          <table className="table">
            <thead>
              <tr>
                <th />
                <th>This Mac</th>
                <th>Store</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {row('Accounts', status.local?.accounts, status.exported.counts.accounts)}
              {row('Rules', status.local?.rules, status.exported.counts.rules)}
              {row('Signatures', status.local?.signatures, status.exported.counts.signatures)}
            </tbody>
          </table>
          {status.missingAccounts.length > 0 && (
            <p className="warn-text">
              Not configured here: {status.missingAccounts.map((a) => `${a.name} (${a.user})`).join(', ')}
            </p>
          )}
        </>
      )}
    </Card>
  )
}

function ExportCard() {
  const toast = useToast()
  const [jobId, setJobId] = useState<null | string>(null)
  const [dryRun, setDryRun] = useState(false)
  const job = useJob<MailEvent, MailExportResult>(jobId)

  useEffect(() => {
    if (job.status === 'failed') toast.error(new Error(job.error?.message ?? 'Export failed'))
    if (job.status === 'succeeded' && job.result?.written) toast.success('Mail settings exported')
  }, [job.status, job.error, job.result, toast])

  const run = async () => {
    try {
      setJobId((await api.jobs.mailExport(dryRun)).id)
    } catch (error) {
      toast.error(error)
    }
  }

  const phase = job.events.at(-1)
  const result = job.result

  return (
    <Card
      actions={
        <>
          <label className="inline">
            <input checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} type="checkbox" /> Dry run
          </label>
          <Button busy={job.status === 'running'} onClick={run} variant="primary">
            Export
          </Button>
        </>
      }
      title="Export"
    >
      <p className="muted">Saves accounts (without passwords), rules and signatures to the iCloud store.</p>
      {job.status === 'running' && phase && <p className="muted">{phase.label}…</p>}
      {result && (
        <ul className="steps">
          <li>
            <Dot tone="ok" /> {result.accounts.length} account(s): {result.accounts.map((a) => a.name).join(', ')}
          </li>
          <li>
            <Dot tone="ok" /> {result.ruleCount} rule(s), {result.conditionCount} condition(s)
          </li>
          <li>
            <Dot tone="ok" /> {result.signatureCount} signature(s)
          </li>
          {!result.written && <li className="warn-text">Dry run - nothing written.</li>}
        </ul>
      )}
    </Card>
  )
}

const ACTION: Record<string, {label: string; tone: Tone}> = {
  blocked: {label: 'needs its mailbox first', tone: 'warn'},
  create: {label: 'will be created', tone: 'ok'},
  present: {label: 'already present', tone: 'muted'},
}

function RestoreCard() {
  const toast = useToast()
  const [plan, setPlan] = useState<MailRestorePlan | null>(null)
  const [busy, setBusy] = useState(false)
  const [jobId, setJobId] = useState<null | string>(null)
  const job = useJob(jobId)

  useEffect(() => {
    if (job.status === 'failed') toast.error(new Error(job.error?.message ?? 'Restore failed'))
    if (job.status === 'succeeded') {
      toast.success('Signatures and rules recreated')
      setPlan(null)
    }
  }, [job.status, job.error, toast])

  const preview = async () => {
    setBusy(true)
    try {
      setPlan(await api.mail.restorePlan())
    } catch (error) {
      toast.error(error)
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    try {
      setJobId((await api.jobs.mailRestore()).id)
    } catch (error) {
      toast.error(error)
    }
  }

  const toCreate = plan ? [...plan.signatures, ...plan.rules].filter((item) => item.action === 'create').length : 0

  return (
    <Card
      actions={
        <Button busy={busy} onClick={preview}>
          Show restore plan
        </Button>
      }
      title="Restore on this Mac"
    >
      {plan && (
        <>
          <h3>Accounts to add in System Settings</h3>
          <ul className="steps">
            {plan.accounts.map(({account, howToAdd, present}) => (
              <li key={account.name}>
                <Dot tone={present ? 'ok' : 'warn'} /> <strong>{account.name}</strong>{' '}
                <span className="muted">
                  ({account.type}, sign in as {account.user}){present ? '' : ` → ${howToAdd}`}
                </span>
              </li>
            ))}
          </ul>
          <h3>Signatures and rules</h3>
          <ul className="steps">
            {[
              ...plan.signatures.map((s) => ({...s, kind: 'Signature'})),
              ...plan.rules.map((r) => ({...r, kind: 'Rule'})),
            ].map((item) => (
              <li key={`${item.kind}-${item.name}`}>
                <Dot tone={ACTION[item.action].tone} /> {item.kind} <strong>{item.name}</strong>{' '}
                <span className="muted">{ACTION[item.action].label}</span>
              </li>
            ))}
          </ul>
          <div className="form-actions">
            <Button busy={job.status === 'running'} disabled={toCreate === 0} onClick={apply} variant="primary">
              Create {toCreate} item(s) in Mail
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
