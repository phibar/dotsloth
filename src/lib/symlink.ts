import * as fs from 'node:fs'
import * as path from 'node:path'

import type {SymlinkStatus} from '../types/index.js'

export interface SymlinkConfig {
  backup?: boolean
  source: string
  target: string
}

/**
 * Create a symlink from target to source
 */
export async function createSymlink(config: SymlinkConfig): Promise<SymlinkStatus> {
  const {backup = true, source, target} = config

  try {
    // Check if source exists in iCloud
    if (!fs.existsSync(source)) {
      return {
        error: `Source file does not exist: ${source}`,
        exists: false,
        isValid: false,
        source,
        target,
      }
    }

    // Check if target exists
    try {
      const stat = fs.lstatSync(target)

      if (stat.isSymbolicLink()) {
        const currentSource = fs.readlinkSync(target)
        if (currentSource === source) {
          // Already correctly linked
          return {
            exists: true,
            isValid: true,
            source,
            target,
          }
        }

        // Remove incorrect symlink
        fs.unlinkSync(target)
      } else if (backup) {
        // Backup existing file
        const backupPath = `${target}.backup.${Date.now()}`
        fs.renameSync(target, backupPath)
        console.log(`Backed up existing file to: ${backupPath}`)
      } else {
        fs.unlinkSync(target)
      }
    } catch (error: unknown) {
      // File doesn't exist, which is fine
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }

    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(target), {recursive: true})

    // Create symlink
    fs.symlinkSync(source, target)

    return {
      exists: true,
      isValid: true,
      source,
      target,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      exists: false,
      isValid: false,
      source,
      target,
    }
  }
}

/**
 * Check status of a symlink
 */
export function checkSymlink(source: string, target: string): SymlinkStatus {
  try {
    const stat = fs.lstatSync(target)

    if (!stat.isSymbolicLink()) {
      return {
        error: 'Target exists but is not a symlink',
        exists: true,
        isValid: false,
        source,
        target,
      }
    }

    const actualSource = fs.readlinkSync(target)
    const isValid = actualSource === source

    return {
      error: isValid ? undefined : `Symlink points to wrong source: ${actualSource}`,
      exists: true,
      isValid,
      source,
      target,
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        error: 'Symlink does not exist',
        exists: false,
        isValid: false,
        source,
        target,
      }
    }

    return {
      error: error instanceof Error ? error.message : String(error),
      exists: false,
      isValid: false,
      source,
      target,
    }
  }
}

/**
 * Remove a symlink
 */
export function removeSymlink(target: string): boolean {
  try {
    const stat = fs.lstatSync(target)
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(target)
      return true
    }

    return false
  } catch {
    return false
  }
}

/**
 * Check multiple symlinks and return their status
 */
export function checkSymlinks(configs: Array<{source: string; target: string}>): SymlinkStatus[] {
  return configs.map((c) => checkSymlink(c.source, c.target))
}
