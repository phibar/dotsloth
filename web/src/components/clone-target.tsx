import {useEffect, useState} from 'react'

import type {ClonePlan, CloneTarget} from '../api.js'
import {Dot} from './ui.js'

/**
 * Purpose: let the person decide where a clone goes when its owner is no
 * configured organization — create it, use another, or clone without one.
 *
 * Intention: reports a CloneTarget, or null while the new org's identity is
 * incomplete, to the clone panels — one repository, or an organisation's —
 * that hand it to their clone job.
 */
export function CloneTargetChoice({
  onChange,
  orgName,
  organizations,
}: {
  onChange: (target: CloneTarget | null) => void
  orgName: string
  organizations: ClonePlan['organizations']
}) {
  const [choice, setChoice] = useState<'existing' | 'new' | 'none'>('new')
  const [existingOrg, setExistingOrg] = useState(organizations[0]?.name ?? '')
  const [gitEmail, setGitEmail] = useState('')
  const [gitUsername, setGitUsername] = useState('')

  useEffect(() => {
    if (choice === 'existing') onChange({kind: 'org', name: existingOrg})
    else if (choice === 'none') onChange({kind: 'none'})
    else onChange(gitEmail && gitUsername ? {gitEmail, gitUsername, kind: 'new-org'} : null)
  }, [choice, existingOrg, gitEmail, gitUsername, onChange])

  return (
    <fieldset className="choices">
      <legend>
        <Dot tone="warn" /> <strong>{orgName}</strong> is not a configured organization
      </legend>
      <label className="inline">
        <input checked={choice === 'new'} name="choice" onChange={() => setChoice('new')} type="radio" /> Create it
      </label>
      {organizations.length > 0 && (
        <label className="inline">
          <input checked={choice === 'existing'} name="choice" onChange={() => setChoice('existing')} type="radio" />{' '}
          Use an existing one
        </label>
      )}
      <label className="inline">
        <input checked={choice === 'none'} name="choice" onChange={() => setChoice('none')} type="radio" /> Clone
        without an identity
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
          {organizations.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}
            </option>
          ))}
        </select>
      )}
    </fieldset>
  )
}
