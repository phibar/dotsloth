import {useEffect, useState} from 'react'

export interface Section {
  id: string
  /** The issue that builds this page out. */
  issue: number
  label: string
  summary: string
}

export const SECTIONS: Section[] = [
  {id: 'dashboard', issue: 69, label: 'Dashboard', summary: 'Health of this machine at a glance, and sync.'},
  {id: 'orgs', issue: 70, label: 'Organizations', summary: 'Git identities per GitHub organization, and cloning.'},
  {id: 'config', issue: 71, label: 'Config', summary: 'Edit config.json with validation.'},
  {id: 'secrets', issue: 72, label: 'Secrets', summary: 'Keychain secrets, revealed one at a time.'},
  {id: 'env', issue: 72, label: 'Env files', summary: 'Back up and restore .env files.'},
  {id: 'doctor', issue: 73, label: 'Doctor', summary: 'Would anything be lost if this machine were wiped?'},
  {id: 'mail', issue: 73, label: 'Mail', summary: 'Mail accounts, rules and signatures.'},
  {id: 'claude', issue: 73, label: 'Claude Code', summary: 'Shared settings, project memory and history.'},
  {id: 'daemon', issue: 69, label: 'Daemon', summary: 'Periodic background sync.'},
]

function current(): string {
  const id = globalThis.location.hash.replace(/^#\/?/, '')
  return SECTIONS.some((s) => s.id === id) ? id : 'dashboard'
}

/** Hash routing (#/orgs): no router dependency, and reloads keep the page. */
export function useRoute(): string {
  const [route, setRoute] = useState(current)

  useEffect(() => {
    const update = () => setRoute(current())
    globalThis.addEventListener('hashchange', update)
    return () => globalThis.removeEventListener('hashchange', update)
  }, [])

  return route
}
