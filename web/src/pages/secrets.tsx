import {type FormEvent, useEffect, useState} from 'react'

import {api} from '../api.js'
import {Button, Card, ConfirmDialog, ErrorNote, useLoad} from '../components/ui.js'
import {useToast} from '../toast.js'

export const REVEAL_SECONDS = 30

export function SecretsPage() {
  const secrets = useLoad(api.secrets.list)
  const [removing, setRemoving] = useState<null | string>(null)
  const toast = useToast()

  if (secrets.error) return <ErrorNote error={secrets.error} />
  const names = secrets.data?.names ?? []

  const remove = async () => {
    const name = removing as string
    setRemoving(null)
    try {
      await api.secrets.remove(name)
      toast.success(`Removed ${name}`)
      secrets.reload()
    } catch (error) {
      toast.error(error)
    }
  }

  return (
    <>
      <Card title={`Secrets in the Keychain (${names.length})`}>
        <p className="muted">
          Stored in the macOS Keychain and synced through iCloud Keychain. Values are fetched one at a time, only when
          you ask.
        </p>
        {names.length === 0 && secrets.data && <p className="muted">No secrets stored yet.</p>}
        <ul className="secret-list">
          {names.map((name) => (
            <SecretRow key={name} name={name} onRemove={() => setRemoving(name)} />
          ))}
        </ul>
      </Card>

      <AddSecret existing={names} onSaved={secrets.reload} />

      {removing && (
        <ConfirmDialog
          confirmLabel="Remove"
          message={
            <p>
              <code>{removing}</code> is deleted from the Keychain on every Mac that syncs it.
            </p>
          }
          onCancel={() => setRemoving(null)}
          onConfirm={remove}
          title={`Remove ${removing}?`}
        />
      )}
    </>
  )
}

function SecretRow({name, onRemove}: {name: string; onRemove: () => void}) {
  const toast = useToast()
  const [value, setValue] = useState<null | string>(null)
  const [left, setLeft] = useState(0)

  // A shown value hides itself again after REVEAL_SECONDS; the interval only drives the countdown.
  useEffect(() => {
    if (value === null) return
    const hide = setTimeout(() => setValue(null), REVEAL_SECONDS * 1000)
    const tick = setInterval(() => setLeft((s) => s - 1), 1000)
    return () => {
      clearTimeout(hide)
      clearInterval(tick)
    }
  }, [value])

  const reveal = async () => {
    try {
      setValue(await api.secrets.reveal(name))
      setLeft(REVEAL_SECONDS)
    } catch (error) {
      toast.error(error)
    }
  }

  // Copies without ever putting the value on screen.
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value ?? (await api.secrets.reveal(name)))
      toast.success(`Copied ${name}`)
    } catch (error) {
      toast.error(error)
    }
  }

  return (
    <li>
      <code className="secret-name">{name}</code>
      <span className="secret-value">
        {value === null ? (
          <span aria-label="hidden" className="muted">
            ••••••••
          </span>
        ) : (
          <>
            <code>{value}</code> <span className="muted small">hides in {left}s</span>
          </>
        )}
      </span>
      <span className="row-actions">
        <Button onClick={copy}>Copy</Button>
        {value === null ? (
          <Button onClick={reveal}>Reveal</Button>
        ) : (
          <Button onClick={() => setValue(null)}>Hide</Button>
        )}
        <Button onClick={onRemove} variant="danger">
          Remove
        </Button>
      </span>
    </li>
  )
}

function AddSecret({existing, onSaved}: {existing: string[]; onSaved: () => void}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const normalized = name.trim().toUpperCase()
  const replaces = existing.includes(normalized)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await api.secrets.set(normalized, value, replaces)
      toast.success(result.created ? `Stored ${result.name}` : `Updated ${result.name}`)
      setName('')
      setValue('')
      onSaved()
    } catch (error) {
      toast.error(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Add or update a secret">
      <form className="secret-form" onSubmit={submit}>
        <label className="field">
          Name
          <input
            autoCapitalize="characters"
            onChange={(e) => setName(e.target.value)}
            placeholder="OPENAI_API_KEY"
            required
            spellCheck={false}
            value={name}
          />
        </label>
        <label className="field">
          Value
          <input autoComplete="off" onChange={(e) => setValue(e.target.value)} required type="password" value={value} />
        </label>
        {replaces && <p className="warn-text small">{normalized} exists and will be replaced.</p>}
        <div className="form-actions">
          <button className="button button-primary" disabled={busy || !normalized || !value} type="submit">
            {replaces ? 'Replace' : 'Store'}
          </button>
        </div>
      </form>
    </Card>
  )
}
