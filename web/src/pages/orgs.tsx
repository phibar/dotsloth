import {type FormEvent, useEffect, useState} from 'react'

import {api, type CloneEvent, type ClonePlan, type CloneResult, type CloneTarget, type OrgInfo} from '../api.js'
import {JobLog} from '../components/job-log.js'
import {Button, Card, ConfirmDialog, Dot, ErrorNote, useLoad} from '../components/ui.js'
import {useToast} from '../toast.js'
import {useJob} from '../use-job.js'

type Editing = {mode: 'add'} | {mode: 'edit'; org: OrgInfo}

export function OrganizationsPage() {
  const orgs = useLoad(api.orgs.list)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [removing, setRemoving] = useState<OrgInfo | null>(null)

  if (orgs.error) return <ErrorNote error={orgs.error} />

  return (
    <>
      <Card
        actions={
          <Button onClick={() => setEditing({mode: 'add'})} variant="primary">
            Add organization
          </Button>
        }
        title="Organizations"
      >
        {orgs.data && orgs.data.length === 0 && <p className="muted">No organizations configured yet.</p>}
        {orgs.data && orgs.data.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Git identity</th>
                  <th>Folder</th>
                  <th>Repos</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {orgs.data.map((org) => (
                  <tr key={org.name}>
                    <td>
                      <strong>{org.name}</strong>
                    </td>
                    <td>
                      {org.gitUsername} <span className="muted">&lt;{org.gitEmail}&gt;</span>
                    </td>
                    <td>
                      <code title={org.path}>{org.folderName}</code>
                    </td>
                    <td>
                      <Dot tone={org.exists ? 'ok' : 'muted'} /> {org.exists ? org.repoCount : 'not created'}
                    </td>
                    <td className="row-actions">
                      <Button onClick={() => setEditing({mode: 'edit', org})}>Edit</Button>
                      <Button onClick={() => setRemoving(org)} variant="danger">
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ClonePanel onCloned={orgs.reload} />

      {editing && (
        <OrgForm
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            orgs.reload()
          }}
        />
      )}
      {removing && (
        <RemoveOrg
          onClose={() => setRemoving(null)}
          onRemoved={() => {
            setRemoving(null)
            orgs.reload()
          }}
          org={removing}
        />
      )}
    </>
  )
}

function OrgForm({editing, onClose, onSaved}: {editing: Editing; onClose: () => void; onSaved: () => void}) {
  const toast = useToast()
  const existing = editing.mode === 'edit' ? editing.org : null
  const [name, setName] = useState(existing?.name ?? '')
  const [gitEmail, setGitEmail] = useState(existing?.gitEmail ?? '')
  const [gitUsername, setGitUsername] = useState(existing?.gitUsername ?? '')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      if (existing) {
        const result = await api.orgs.update(existing.name, {gitEmail, gitUsername})
        toast.success(result.changed ? `Updated ${existing.name}` : 'Nothing changed')
      } else {
        await api.orgs.add({gitEmail, gitUsername, name})
        toast.success(`Added ${name}`)
      }

      onSaved()
    } catch (error) {
      toast.error(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop">
      <form aria-labelledby="org-form-title" className="dialog" onSubmit={submit}>
        <h2 id="org-form-title">{existing ? `Edit ${existing.name}` : 'Add organization'}</h2>
        <label className="field">
          Name (as on GitHub)
          <input disabled={Boolean(existing)} onChange={(e) => setName(e.target.value)} required value={name} />
        </label>
        <label className="field">
          Git email
          <input onChange={(e) => setGitEmail(e.target.value)} required type="email" value={gitEmail} />
        </label>
        <label className="field">
          Git username
          <input onChange={(e) => setGitUsername(e.target.value)} required value={gitUsername} />
        </label>
        <p className="muted small">Repositories in this organization's folder commit with this identity.</p>
        <div className="dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <button className="button button-primary" disabled={busy} type="submit">
            {existing ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  )
}

function RemoveOrg({onClose, onRemoved, org}: {onClose: () => void; onRemoved: () => void; org: OrgInfo}) {
  const toast = useToast()
  const [deleteRepos, setDeleteRepos] = useState(false)

  const remove = async () => {
    try {
      const result = await api.orgs.remove(org.name, deleteRepos ? {confirm: org.name, deleteRepos} : {})
      toast.success(result.deletedFolder ? `Removed ${org.name} and deleted ${org.path}` : `Removed ${org.name}`)
      onRemoved()
    } catch (error) {
      toast.error(error)
    }
  }

  return (
    <ConfirmDialog
      confirmLabel={deleteRepos ? 'Remove and delete repos' : 'Remove'}
      confirmText={deleteRepos ? org.name : undefined}
      message={
        <>
          <p>
            The git identity for <strong>{org.name}</strong> is removed from the config. Repositories keep working, but
            commits fall back to your default identity.
          </p>
          {org.exists && (
            <label className="inline danger-option">
              <input checked={deleteRepos} onChange={(e) => setDeleteRepos(e.target.checked)} type="checkbox" /> Also
              delete <code>{org.path}</code> and its {org.repoCount} repositories
            </label>
          )}
        </>
      }
      onCancel={onClose}
      onConfirm={remove}
      title={`Remove ${org.name}?`}
    />
  )
}

function ClonePanel({onCloned}: {onCloned: () => void}) {
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [plan, setPlan] = useState<ClonePlan | null>(null)
  const [choice, setChoice] = useState<'existing' | 'new' | 'none'>('new')
  const [existingOrg, setExistingOrg] = useState('')
  const [gitEmail, setGitEmail] = useState('')
  const [gitUsername, setGitUsername] = useState('')
  const [jobId, setJobId] = useState<null | string>(null)
  const job = useJob<CloneEvent, CloneResult>(jobId)

  useEffect(() => {
    if (job.status === 'succeeded' && job.result) {
      toast.success(`Cloned to ${job.result.repoPath}`)
      onCloned()
    }

    if (job.status === 'failed') toast.error(new Error(job.error?.message ?? 'Clone failed'))
  }, [job.status, job.result, job.error, onCloned, toast])

  const check = async (event: FormEvent) => {
    event.preventDefault()
    try {
      const result = await api.clone.plan(url)
      setPlan(result)
      setExistingOrg(result.organizations[0]?.name ?? '')
      setChoice('new')
      setJobId(null)
    } catch (error) {
      setPlan(null)
      toast.error(error)
    }
  }

  const target = (): CloneTarget | undefined => {
    if (!plan || plan.org) return undefined
    if (choice === 'existing') return {kind: 'org', name: existingOrg}
    if (choice === 'none') return {kind: 'none'}
    return {gitEmail, gitUsername, kind: 'new-org'}
  }

  const start = async () => {
    try {
      setJobId((await api.jobs.clone(plan?.url ?? url, target())).id)
    } catch (error) {
      toast.error(error)
    }
  }

  const folder = plan?.org?.folderName ?? (choice === 'existing' ? existingOrg : plan?.orgName)
  const lines = job.events.filter((e) => e.type === 'output').map((e) => (e as {line: string}).line)

  return (
    <Card title="Clone a repository">
      <form className="inline-form" onSubmit={check}>
        <input
          aria-label="Repository URL"
          onChange={(e) => {
            setUrl(e.target.value)
            setPlan(null)
          }}
          placeholder="git@github.com:org/repo.git"
          value={url}
        />
        <Button disabled={!url} onClick={check}>
          Check
        </Button>
      </form>

      {plan && (
        <div className="clone-plan">
          {plan.org ? (
            <p>
              <Dot tone="ok" /> Organization <strong>{plan.org.name}</strong> — commits as {plan.org.gitUsername} &lt;
              {plan.org.gitEmail}&gt;
            </p>
          ) : (
            <fieldset className="choices">
              <legend>
                <Dot tone="warn" /> <strong>{plan.orgName}</strong> is not a configured organization
              </legend>
              <label className="inline">
                <input checked={choice === 'new'} name="choice" onChange={() => setChoice('new')} type="radio" /> Create
                it
              </label>
              {plan.organizations.length > 0 && (
                <label className="inline">
                  <input
                    checked={choice === 'existing'}
                    name="choice"
                    onChange={() => setChoice('existing')}
                    type="radio"
                  />{' '}
                  Use an existing one
                </label>
              )}
              <label className="inline">
                <input checked={choice === 'none'} name="choice" onChange={() => setChoice('none')} type="radio" />{' '}
                Clone without an identity
              </label>

              {choice === 'new' && (
                <div className="field-row">
                  <input
                    aria-label="Git email"
                    onChange={(e) => setGitEmail(e.target.value)}
                    placeholder="Git email"
                    type="email"
                    value={gitEmail}
                  />
                  <input
                    aria-label="Git username"
                    onChange={(e) => setGitUsername(e.target.value)}
                    placeholder="Git username"
                    value={gitUsername}
                  />
                </div>
              )}
              {choice === 'existing' && (
                <select aria-label="Organization" onChange={(e) => setExistingOrg(e.target.value)} value={existingOrg}>
                  {plan.organizations.map((o) => (
                    <option key={o.name} value={o.name}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}
            </fieldset>
          )}
          <p className="muted">
            Into <code>{`${plan.githubRoot}/${folder}/${plan.repo}`}</code>
          </p>
          <Button
            busy={job.status === 'running'}
            disabled={choice === 'new' && !plan.org && (!gitEmail || !gitUsername)}
            onClick={start}
            variant="primary"
          >
            Clone
          </Button>
        </div>
      )}

      <JobLog lines={lines} />
    </Card>
  )
}
