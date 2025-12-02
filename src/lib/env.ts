import {createHash} from 'node:crypto'
import * as fs from 'node:fs'
import {dirname, join, relative} from 'node:path'

import {getEnvFilePath, PATHS} from './paths.js'

/**
 * Common .env file patterns to look for
 */
const ENV_FILE_PATTERNS = new Set([
  '.env',
  '.env.development',
  '.env.development.local',
  '.env.local',
  '.env.production',
  '.env.production.local',
  '.env.test',
  '.env.test.local',
])

export interface EnvFile {
  /** Absolute path to the env file in the project */
  absolutePath: string
  /** Whether a backup exists in iCloud */
  backedUp: boolean
  /** Name of the env file (e.g., ".env", ".env.local") */
  fileName: string
  /** Path relative to github root (e.g., "my-org/my-repo/.env") */
  relativePath: string
}

export interface EnvFileStatus extends EnvFile {
  /** Hash of the local file content */
  localHash?: string
  /** Hash of the backed up file content */
  remoteHash?: string
  /** Whether local and backup are in sync */
  synced: boolean
}

/**
 * Hash function for comparing file contents using SHA-256
 */
function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Check if a directory should be skipped during scanning
 */
function shouldSkipDirectory(name: string): boolean {
  const skipDirs = new Set([
    '.git',
    '.next',
    '.nuxt',
    '.output',
    '.venv',
    '__pycache__',
    'build',
    'coverage',
    'dist',
    'node_modules',
    'target',
    'vendor',
    'venv',
  ])
  return skipDirs.has(name)
}

/**
 * Recursively scan a directory for .env files
 */
function scanDirectory(dir: string, envFiles: string[]): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, {withFileTypes: true})
  } catch {
    // Skip directories we can't read
    return
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(entry.name)) {
        scanDirectory(fullPath, envFiles)
      }
    } else if (entry.isFile() && ENV_FILE_PATTERNS.has(entry.name)) {
      envFiles.push(fullPath)
    }
  }
}

/**
 * Scan the github root for all .env files
 */
export function scanForEnvFiles(githubRoot: string = PATHS.githubRoot): EnvFile[] {
  const envFilePaths: string[] = []

  if (!fs.existsSync(githubRoot)) {
    return []
  }

  scanDirectory(githubRoot, envFilePaths)

  return envFilePaths.map((absolutePath) => {
    const relativePath = relative(githubRoot, absolutePath)
    const fileName = relativePath.split('/').pop() ?? ''
    const projectPath = relativePath.replace(`/${fileName}`, '')
    const backupPath = getEnvFilePath(projectPath, fileName)

    return {
      absolutePath,
      backedUp: fs.existsSync(backupPath),
      fileName,
      relativePath,
    }
  })
}

/**
 * Get the status of all env files (with sync information)
 */
export function getEnvFilesStatus(githubRoot: string = PATHS.githubRoot): EnvFileStatus[] {
  const envFiles = scanForEnvFiles(githubRoot)

  return envFiles.map((envFile) => {
    const projectPath = dirname(envFile.relativePath)
    const backupPath = getEnvFilePath(projectPath, envFile.fileName)

    let localHash: string | undefined
    let remoteHash: string | undefined
    let synced = false

    try {
      const localContent = fs.readFileSync(envFile.absolutePath, 'utf8')
      localHash = hashContent(localContent)
    } catch {
      // File might have been deleted
    }

    if (envFile.backedUp) {
      try {
        const remoteContent = fs.readFileSync(backupPath, 'utf8')
        remoteHash = hashContent(remoteContent)
      } catch {
        // Backup might have been deleted
      }
    }

    if (localHash && remoteHash) {
      synced = localHash === remoteHash
    }

    return {
      ...envFile,
      localHash,
      remoteHash,
      synced,
    }
  })
}

/**
 * Backup an env file to iCloud
 */
export function backupEnvFile(envFile: EnvFile): {backupPath: string; success: boolean} {
  const projectPath = dirname(envFile.relativePath)
  const backupPath = getEnvFilePath(projectPath, envFile.fileName)

  try {
    // Ensure the directory exists
    fs.mkdirSync(dirname(backupPath), {recursive: true})

    // Copy the file
    fs.copyFileSync(envFile.absolutePath, backupPath)

    return {backupPath, success: true}
  } catch {
    return {backupPath, success: false}
  }
}

/**
 * Backup all env files to iCloud
 */
export function backupAllEnvFiles(
  githubRoot: string = PATHS.githubRoot,
): {backed: number; failed: number; results: Array<{envFile: EnvFile; success: boolean}>} {
  const envFiles = scanForEnvFiles(githubRoot)
  const results: Array<{envFile: EnvFile; success: boolean}> = []
  let backed = 0
  let failed = 0

  for (const envFile of envFiles) {
    const {success} = backupEnvFile(envFile)
    results.push({envFile, success})
    if (success) {
      backed++
    } else {
      failed++
    }
  }

  return {backed, failed, results}
}

/**
 * Restore an env file from iCloud to its project location
 */
export function restoreEnvFile(envFile: EnvFile): {restored: boolean; targetPath: string} {
  const projectPath = dirname(envFile.relativePath)
  const backupPath = getEnvFilePath(projectPath, envFile.fileName)

  if (!fs.existsSync(backupPath)) {
    return {restored: false, targetPath: envFile.absolutePath}
  }

  try {
    // Ensure the target directory exists
    fs.mkdirSync(dirname(envFile.absolutePath), {recursive: true})

    // Copy the file
    fs.copyFileSync(backupPath, envFile.absolutePath)

    return {restored: true, targetPath: envFile.absolutePath}
  } catch {
    return {restored: false, targetPath: envFile.absolutePath}
  }
}

/**
 * List all backed up env files from iCloud
 */
export function listBackedUpEnvFiles(): EnvFile[] {
  const envFilesDir = PATHS.icloudEnvFiles
  const envFiles: EnvFile[] = []

  if (!fs.existsSync(envFilesDir)) {
    return []
  }

  function scanBackupDirectory(dir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true})
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        scanBackupDirectory(fullPath)
      } else if (entry.isFile() && ENV_FILE_PATTERNS.has(entry.name)) {
        const relativePath = relative(envFilesDir, fullPath)
        const absolutePath = join(PATHS.githubRoot, relativePath)

        envFiles.push({
          absolutePath,
          backedUp: true,
          fileName: entry.name,
          relativePath,
        })
      }
    }
  }

  scanBackupDirectory(envFilesDir)
  return envFiles
}

/**
 * Restore all backed up env files from iCloud
 */
export function restoreAllEnvFiles(): {
  failed: number
  restored: number
  results: Array<{envFile: EnvFile; success: boolean}>
} {
  const backedUpFiles = listBackedUpEnvFiles()
  const results: Array<{envFile: EnvFile; success: boolean}> = []
  let restored = 0
  let failed = 0

  for (const envFile of backedUpFiles) {
    const {restored: success} = restoreEnvFile(envFile)
    results.push({envFile, success})
    if (success) {
      restored++
    } else {
      failed++
    }
  }

  return {failed, restored, results}
}
