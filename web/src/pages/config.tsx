import {useMemo, useState} from 'react'

import {DevSlothConfigSchema} from '../../../src/types/index.js'
import {ApiError, api, type DevSlothConfig, type VersionedConfig} from '../api.js'
import {SyncPanel} from '../components/sync-panel.js'
import {Button, Card, Dot, ErrorNote, useLoad} from '../components/ui.js'
import {changedHunks, lineDiff} from '../diff.js'
import {useToast} from '../toast.js'

const pretty = (config: DevSlothConfig) => JSON.stringify(config, null, 2)

/** Parse and validate JSON with the same schema the server uses. */
export function validateConfigText(text: string): {config?: DevSlothConfig; errors: string[]} {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    return {errors: [`Not valid JSON: ${(error as Error).message}`]}
  }

  const result = DevSlothConfigSchema.safeParse(data)
  if (result.success) return {config: result.data, errors: []}
  return {errors: result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)}
}

export function ConfigPage() {
  const loaded = useLoad(api.config.get)
  const status = useLoad(api.status)

  if (loaded.error) return <ErrorNote error={loaded.error} />
  if (!loaded.data) return <p className="muted">Loading…</p>

  return (
    <Editor
      // Remount on reload, so the draft starts from the fresh file.
      key={loaded.data.version}
      links={status.data?.symlinks ?? []}
      loaded={loaded.data}
      onReload={loaded.reload}
    />
  )
}

function Editor({
  links,
  loaded,
  onReload,
}: {
  links: Array<{isValid: boolean; target: string}>
  loaded: VersionedConfig
  onReload: () => void
}) {
  const toast = useToast()
  const [current, setCurrent] = useState(loaded)
  const [tab, setTab] = useState<'form' | 'json'>('form')
  const [draft, setDraft] = useState<DevSlothConfig>(loaded.config)
  const [jsonText, setJsonText] = useState(() => pretty(loaded.config))
  const [reviewing, setReviewing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const jsonCheck = useMemo(() => validateConfigText(jsonText), [jsonText])
  const candidate = tab === 'json' ? jsonCheck.config : draft
  const changed = candidate !== undefined && pretty(candidate) !== pretty(current.config)

  // Each tab edits its own representation; switching hands the current one over.
  const switchTo = (next: 'form' | 'json') => {
    if (next === tab) return
    if (next === 'json') {
      setJsonText(pretty(draft))
    } else if (jsonCheck.config) {
      setDraft(jsonCheck.config)
    } else {
      toast.error(new Error('Fix the JSON before switching to the form'))
      return
    }

    setTab(next)
  }

  const save = async () => {
    if (!candidate) return
    setBusy(true)
    try {
      const result = await api.config.put(candidate, current.version)
      setCurrent(result)
      setDraft(result.config)
      setJsonText(pretty(result.config))
      setReviewing(false)
      setSaved(true)
      toast.success('Configuration saved')
    } catch (error) {
      setReviewing(false)
      toast.error(error)
      if (error instanceof ApiError && error.status === 409) onReload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card
        actions={
          <>
            <Button onClick={() => switchTo('form')} variant={tab === 'form' ? 'primary' : 'secondary'}>
              Form
            </Button>
            <Button onClick={() => switchTo('json')} variant={tab === 'json' ? 'primary' : 'secondary'}>
              JSON
            </Button>
          </>
        }
        title="config.json"
      >
        {tab === 'form' ? (
          <ConfigForm draft={draft} links={links} onChange={setDraft} />
        ) : (
          <>
            <textarea
              aria-label="config.json"
              className="code-editor"
              onChange={(e) => setJsonText(e.target.value)}
              rows={24}
              spellCheck={false}
              value={jsonText}
            />
            {jsonCheck.errors.length > 0 && (
              <ul className="error-list">
                {jsonCheck.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
          </>
        )}

        <div className="form-actions">
          <Button
            disabled={!changed}
            onClick={() => {
              setDraft(current.config)
              setJsonText(pretty(current.config))
            }}
          >
            Discard changes
          </Button>
          <Button disabled={!changed} onClick={() => setReviewing(true)} variant="primary">
            Review and save
          </Button>
        </div>
      </Card>

      {saved && <SyncPanel />}

      {reviewing && candidate && (
        <div className="dialog-backdrop">
          <div aria-labelledby="review-title" aria-modal="true" className="dialog dialog-wide" role="dialog">
            <h2 id="review-title">Save these changes?</h2>
            <DiffView after={pretty(candidate)} before={pretty(current.config)} />
            <div className="dialog-actions">
              <Button onClick={() => setReviewing(false)}>Back</Button>
              <Button busy={busy} onClick={save} variant="primary">
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function DiffView({after, before}: {after: string; before: string}) {
  const hunks = changedHunks(lineDiff(before, after))
  return (
    <pre className="diff">
      {hunks.map((line, index) =>
        line === null ? (
          // separators have no identity
          <div className="diff-gap" key={`gap-${index}`}>
            ⋯
          </div>
        ) : (
          // diff lines can repeat; position is their identity
          <div className={`diff-${line.type}`} key={index}>
            {{add: '+ ', remove: '- ', same: '  '}[line.type]}
            {line.text}
          </div>
        ),
      )}
    </pre>
  )
}

function ConfigForm({
  draft,
  links,
  onChange,
}: {
  draft: DevSlothConfig
  links: Array<{isValid: boolean; target: string}>
  onChange: (config: DevSlothConfig) => void
}) {
  const setSynced = (index: number, field: 'source' | 'target', value: string) =>
    onChange({
      ...draft,
      syncedFiles: draft.syncedFiles.map((file, i) => (i === index ? {...file, [field]: value} : file)),
    })

  return (
    <div className="config-form">
      <label className="field">
        GitHub root
        <input
          onChange={(e) => onChange({...draft, paths: {...draft.paths, githubRoot: e.target.value}})}
          value={draft.paths.githubRoot}
        />
        <span className="muted small">Org folders live directly below this directory.</span>
      </label>

      <label className="field">
        Default organization
        <select
          onChange={(e) => onChange({...draft, defaultOrganization: e.target.value || undefined})}
          value={draft.defaultOrganization ?? ''}
        >
          <option value="">None</option>
          {draft.organizations.map((org) => (
            <option key={org.name} value={org.name}>
              {org.name}
            </option>
          ))}
        </select>
        <span className="muted small">Organizations themselves are managed on the Organizations page.</span>
      </label>

      <fieldset className="field">
        <legend>SSH commit signing</legend>
        <label className="inline">
          <input
            checked={draft.sshSigning.enabled}
            onChange={(e) => onChange({...draft, sshSigning: {...draft.sshSigning, enabled: e.target.checked}})}
            type="checkbox"
          />{' '}
          Sign commits with an SSH key
        </label>
        <input
          aria-label="SSH key path"
          disabled={!draft.sshSigning.enabled}
          onChange={(e) => onChange({...draft, sshSigning: {...draft.sshSigning, defaultKeyPath: e.target.value}})}
          value={draft.sshSigning.defaultKeyPath}
        />
      </fieldset>

      <fieldset className="field">
        <legend>Synced files</legend>
        <p className="muted small">Each target on this machine is a symlink to its source in iCloud.</p>
        {draft.syncedFiles.map((file, index) => {
          const link = links.find((l) => l.target === file.target)
          return (
            // rows are edited in place; the target may be blank or repeat
            <div className="synced-row" key={index}>
              <Dot label={link?.isValid ? 'linked' : 'not linked'} tone={link?.isValid ? 'ok' : 'warn'} />
              <input
                aria-label={`Target ${index + 1}`}
                onChange={(e) => setSynced(index, 'target', e.target.value)}
                placeholder="~/.something"
                value={file.target}
              />
              <span aria-hidden="true">→</span>
              <input
                aria-label={`Source ${index + 1}`}
                onChange={(e) => setSynced(index, 'source', e.target.value)}
                placeholder="iCloud path"
                value={file.source}
              />
              <Button
                aria-label={`Remove ${file.target || `row ${index + 1}`}`}
                onClick={() => onChange({...draft, syncedFiles: draft.syncedFiles.filter((_, i) => i !== index)})}
              >
                ×
              </Button>
            </div>
          )
        })}
        <Button onClick={() => onChange({...draft, syncedFiles: [...draft.syncedFiles, {source: '', target: ''}]})}>
          Add file
        </Button>
      </fieldset>
    </div>
  )
}
