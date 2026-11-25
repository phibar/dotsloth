import {type FormEvent, useEffect, useState} from 'react'

import {api, type CloneTarget, type OrgCloneEvent, type OrgClonePlan, type OrgCloneResult} from '../api.js'
import {CloneTargetChoice} from '../components/clone-target.js'
import {JobLog, type LogLine, outputLine} from '../components/job-log.js'
import {Button, Card, Dot} from '../components/ui.js'
import {useToast} from '../toast.js'
import {useJob} from '../use-job.js'

/**
 * Purpose: from the browser, bring an organisation's repositories — all, or
 * those with given topics — onto the machine, picked from a list.
 *
 * Intention: uses the org-plan route and the clone-org job, and
 * CloneTargetChoice when the owner is no configured organization; the
 * Organizations page holds it and reloads its table once a run ends.
 */
export function OrgClonePanel({onCloned}: {onCloned: () => void}) {
  const toast = useToast()
  const [owner, setOwner] = useState('')
  const [topicText, setTopicText] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [includeForks, setIncludeForks] = useState(false)
  const [plan, setPlan] = useState<null | OrgClonePlan>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState<CloneTarget | null>(null)
  const [jobId, setJobId] = useState<null | string>(null)
  const job = useJob<OrgCloneEvent, OrgCloneResult>(jobId)

  const filter = {
    includeArchived,
    includeForks,
    topics: topicText
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean),
  }

  useEffect(() => {
    if (job.status === 'succeeded' && job.result) {
      const {cloned, failed, local} = job.result
      toast.success(`Cloned ${cloned.length}, already there ${local.length}`)
      if (failed.length > 0) toast.error(new Error(`Failed: ${failed.map((f) => f.name).join(', ')}`))
      onCloned()
    }

    if (job.status === 'failed') toast.error(new Error(job.error?.message ?? 'Clone failed'))
  }, [job.status, job.result, job.error, onCloned, toast])

  const list = async (event: FormEvent) => {
    event.preventDefault()
    try {
      const result = await api.clone.orgPlan(owner.trim(), filter)
      setPlan(result)
      setPicked(new Set(result.repos.filter((r) => !r.local).map((r) => r.name)))
      setJobId(null)
    } catch (error) {
      setPlan(null)
      toast.error(error)
    }
  }

  const toggle = (name: string) =>
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  const start = async () => {
    if (!plan) return
    try {
      const repos = plan.repos.filter((r) => picked.has(r.name)).map((r) => r.name)
      setJobId((await api.jobs.cloneOrg(plan.owner, repos, filter, plan.org ? undefined : (target ?? undefined))).id)
    } catch (error) {
      toast.error(error)
    }
  }

  return (
    <Card title="Clone an organization's repositories">
      <form className="inline-form" onSubmit={list}>
        <input
          aria-label="Organization on GitHub"
          onChange={(e) => {
            setOwner(e.target.value)
            setPlan(null)
          }}
          placeholder="metatrom-ag"
          value={owner}
        />
        <input
          aria-label="Topics"
          onChange={(e) => {
            setTopicText(e.target.value)
            setPlan(null)
          }}
          placeholder="Topics, any of: 0field, kernel"
          value={topicText}
        />
        <Button disabled={!owner.trim()} onClick={list}>
          List
        </Button>
      </form>
      <label className="inline">
        <input checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} type="checkbox" />{' '}
        Include archived
      </label>
      <label className="inline">
        <input checked={includeForks} onChange={(e) => setIncludeForks(e.target.checked)} type="checkbox" /> Include
        forks
      </label>

      {plan && (
        <div className="clone-plan">
          {plan.repos.length === 0 && <p className="muted">No repositories match.</p>}
          {plan.repos.length > 0 && (
            <ul aria-label="Repositories" className="repo-pick">
              {plan.repos.map((repo) => (
                <li key={repo.name}>
                  <label className="inline">
                    <input
                      checked={repo.local || picked.has(repo.name)}
                      disabled={repo.local}
                      onChange={() => toggle(repo.name)}
                      type="checkbox"
                    />{' '}
                    {repo.name}
                  </label>
                  <span className="muted small">{repo.local ? 'already cloned' : repo.topics.join(', ')}</span>
                </li>
              ))}
            </ul>
          )}

          {plan.org ? (
            <p>
              <Dot tone="ok" /> Organization <strong>{plan.org.name}</strong> — commits as {plan.org.gitUsername} &lt;
              {plan.org.gitEmail}&gt;
            </p>
          ) : (
            <CloneTargetChoice
              key={plan.orgName}
              onChange={setTarget}
              orgName={plan.orgName}
              organizations={plan.organizations}
            />
          )}
          <Button
            busy={job.status === 'running'}
            disabled={picked.size === 0 || (!plan.org && !target)}
            onClick={start}
            variant="primary"
          >
            Clone {picked.size}
          </Button>
        </div>
      )}

      <JobLog lines={job.events.map(logLine).filter((line) => line !== null)} />
    </Card>
  )
}

function logLine(event: OrgCloneEvent): LogLine | null {
  switch (event.type) {
    case 'repo':
      return `[${event.index}/${event.total}] ${event.name}`
    case 'output':
      return outputLine(event)
    case 'repo-local':
      return `  already at ${event.repoPath}`
    case 'repo-failed':
      return `✗ ${event.name}: ${event.message}`
    case 'org-created':
      return `Created organization ${event.name}`
    case 'topics':
      return 'Linking topics…'
    default:
      return null
  }
}
