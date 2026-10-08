import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// Every test runs against a throwaway HOME. PATHS is computed from it when
// src/lib/paths.ts is first imported, so this has to run before any test file
// loads - .mocharc.json requires it first. Without it, tests that write the
// config, gitconfigs or the iCloud store would touch the real ones.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-home-'))
process.env.HOME = home

if (os.homedir() !== home) {
  throw new Error(`test HOME was not applied (os.homedir() = ${os.homedir()})`)
}
