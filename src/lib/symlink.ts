import * as fs from 'node:fs'
import * as path from 'node:path'

import type {SymlinkStatus} from '../types/index.js'

export interface SymlinkConfig {
  source: string
  target: string
  backup?: boolean
}

/**
 * Create a symlink from target to source
 */
export async function createSymlink(config: SymlinkConfig): Promise<SymlinkStatus> {
  const {source, target, backup = true} = config

  try {
    // Check if source exists in iCloud
    if (!fs.existsSync(source)) {
      return {
        source,
        target,
        exists: false,
        isValid: false,
        error: `Source file does not exist: ${source}`,
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
            source,
            target,
            exists: true,
            isValid: true,
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
      source,
      target,
      exists: true,
      isValid: true,
    }
  } catch (error) {
    return {
      source,
      target,
      exists: false,
      isValid: false,
      error: error instanceof Error ? error.message : String(error),
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
        source,
        target,
        exists: true,
        isValid: false,
        error: 'Target exists but is not a symlink',
      }
    }

    const actualSource = fs.readlinkSync(target)
    const isValid = actualSource === source

    return {
      source,
      target,
      exists: true,
      isValid,
      error: isValid ? undefined : `Symlink points to wrong source: ${actualSource}`,
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        source,
        target,
        exists: false,
        isValid: false,
        error: 'Symlink does not exist',
      }
    }

    return {
      source,
      target,
      exists: false,
      isValid: false,
      error: error instanceof Error ? error.message : String(error),
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
