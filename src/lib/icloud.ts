import * as fs from 'node:fs'
import * as path from 'node:path'
import {run} from './exec.js'
import {PATHS} from './paths.js'

/**
 * Files iCloud has not finished uploading yet.
 *
 * A file sitting in the iCloud folder is not yet a backup. Until the upload
 * completes it exists only on this disk, so wiping the machine destroys it —
 * the one failure that would make the whole backup worthless. macOS marks
 * not-yet-materialised files with a `.icloud` placeholder, and `brctl` knows
 * about pending transfers.
 */
export function pendingUploads(dir: string = PATHS.icloudDotsloth): string[] {
  const pending: string[] = []
  if (!fs.existsSync(dir)) return pending

  const walk = (current: string) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, {withFileTypes: true})
    } catch {
      return
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      // A ".foo.icloud" stub means the content is not local; for our own
      // backup directory that means it is still in flight or evicted.
      else if (entry.name.startsWith('.') && entry.name.endsWith('.icloud')) pending.push(full)
    }
  }

  walk(dir)
  return pending
}

/** Ask brctl to block until sync settles. Returns false if it could not be confirmed. */
export function waitForSync(timeoutSeconds = 120): boolean {
  try {
    run('brctl', ['log', '--wait', '--shorten'], {timeout: timeoutSeconds * 1000})
    return true
  } catch {
    // brctl --wait streams until interrupted; a timeout here is expected and
    // is not itself evidence of a problem.
    return false
  }
}
