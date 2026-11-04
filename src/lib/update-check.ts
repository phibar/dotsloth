/*
 * Purpose: Check npm for a newer dotsloth version, caching the result for 24h.
 * Intention: uses readState/saveUpdateCheckState from state; consumed by BaseCommand and core/update.
 */

import {readState, saveUpdateCheckState} from './state.js'

const REGISTRY_URL = 'https://registry.npmjs.org/@phibar/dotsloth/latest'
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface UpdateInfo {
  current: string
  latest: string
}

function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split('.').map(Number)
  const b = current.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false
  }

  return false
}

async function fetchLatestVersion(): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(REGISTRY_URL, {signal: controller.signal})
    if (!response.ok) return null
    const data = (await response.json()) as {version?: string}
    return data.version ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  const state = readState()
  const cached = state.updateCheck
  const isStale = !cached || Date.now() - new Date(cached.checkedAt).getTime() > CHECK_INTERVAL_MS

  const latestVersion = isStale ? await fetchLatestVersion() : cached.latestVersion

  if (latestVersion) {
    if (isStale) saveUpdateCheckState({checkedAt: new Date().toISOString(), latestVersion})
    if (isNewer(latestVersion, currentVersion)) return {current: currentVersion, latest: latestVersion}
  }

  return null
}
