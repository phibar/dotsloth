/*
 * Purpose: Typed read/write of ~/.config/dotsloth/state.json for persistent local state.
 * Intention: uses PATHS from paths, z from zod; consumed by update-check.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import {z} from 'zod'

import {PATHS} from './paths.js'

const UpdateCheckSchema = z.object({
  checkedAt: z.string(),
  latestVersion: z.string(),
})

const StateSchema = z.object({
  updateCheck: UpdateCheckSchema.optional(),
})

type State = z.infer<typeof StateSchema>
export type UpdateCheckState = z.infer<typeof UpdateCheckSchema>

export function readState(): State {
  try {
    return StateSchema.parse(JSON.parse(fs.readFileSync(PATHS.localState, 'utf8')))
  } catch {
    return {}
  }
}

export function saveUpdateCheckState(updateCheck: UpdateCheckState): void {
  const current = readState()
  fs.mkdirSync(path.dirname(PATHS.localState), {recursive: true})
  fs.writeFileSync(PATHS.localState, JSON.stringify({...current, updateCheck}, null, 2), 'utf8')
}
