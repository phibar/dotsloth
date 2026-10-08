import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {PATHS} from '../src/lib/paths.js'

/** Empty the throwaway HOME from test/setup.ts, optionally with iCloud Drive present. */
export function resetHome({icloud = true} = {}): void {
  const home = os.homedir()
  if (!home.includes('dotsloth-home-')) throw new Error(`refusing to reset a real HOME: ${home}`)

  for (const entry of fs.readdirSync(home)) fs.rmSync(path.join(home, entry), {force: true, recursive: true})
  if (icloud) fs.mkdirSync(PATHS.icloudDrive, {recursive: true})
}

/**
 * Put shell-script stand-ins for system tools first on PATH, so tests never
 * reach the real Keychain or ssh-agent. Returns a function that restores PATH.
 */
export function fakeBinaries(scripts: Record<string, string>): () => void {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-bin-'))
  for (const [name, body] of Object.entries(scripts)) {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, {mode: 0o755})
  }

  const original = process.env.PATH
  process.env.PATH = `${bin}${path.delimiter}${original}`
  return () => {
    process.env.PATH = original
    fs.rmSync(bin, {force: true, recursive: true})
  }
}

/** No secrets in the Keychain, no keys in the agent, and a Mail that answers nothing - never the real one. */
export const EMPTY_SYSTEM = {osascript: 'exit 0', security: 'exit 0', 'ssh-add': 'exit 1'}

/**
 * A stand-in for macOS `security` that keeps one file per secret in
 * $FAKE_KEYCHAIN and prints dump-keychain in the real format.
 */
export const FAKE_SECURITY = String.raw`
cmd=$1; shift; name=""; value=""
while [ $# -gt 0 ]; do
  case "$1" in
    -s) name=$2; shift ;;
    -w) if [ $# -gt 1 ]; then value=$2; shift; fi ;;
  esac
  shift
done
file="$FAKE_KEYCHAIN/$name"
case "$cmd" in
  add-generic-password) printf '%s' "$value" > "$file" ;;
  find-generic-password) [ -f "$file" ] || exit 44; cat "$file"; echo ;;
  delete-generic-password) [ -f "$file" ] || exit 44; rm "$file" ;;
  dump-keychain) for f in "$FAKE_KEYCHAIN"/*; do [ -f "$f" ] || continue
    echo '    "acct"<blob>="dotsloth"'; echo "    \"svce\"<blob>=\"$(basename "$f")\""; done ;;
esac
`
