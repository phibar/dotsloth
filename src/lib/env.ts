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
  /** Name of the env file (e.g., ".env", ".env.local") */
  fileName: string
  /** Path to the iCloud source file */
  icloudPath: string
  /** Whether the file exists in iCloud (source of truth) */
  inIcloud: boolean
  /** Whether the local path is a symlink pointing to iCloud */
  isSymlinked: boolean
  /** Path relative to github root (e.g., "my-org/my-repo/.env") */
  relativePath: string
}

export interface EnvFileStatus extends EnvFile {
  /** True if local is a regular file (not symlink) */
  hasLocalFile: boolean
  /** Hash of the iCloud file content */
  icloudHash?: string
  /** Hash of the local file content (only for regular files) */
  localHash?: string
  /** Status of the env file */
  status: 'conflict' | 'orphaned' | 'regular-file' | 'synced' | 'unsynced'
}

export interface SyncResult {
  action: 'conflict' | 'created' | 'linked' | 'skipped'
  envFile: EnvFile
  error?: string
  success: boolean
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
 * Recursively scan a directory for .env files (including symlinks)
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
    } else if ((entry.isFile() || entry.isSymbolicLink()) && ENV_FILE_PATTERNS.has(entry.name)) {
      envFiles.push(fullPath)
    }
  }
}

/**
 * Check if a path is a symlink pointing to the expected iCloud path
 */
function isValidSymlink(localPath: string, expectedIcloudPath: string): boolean {
  try {
    const stat = fs.lstatSync(localPath)
    if (!stat.isSymbolicLink()) {
      return false
    }

    const target = fs.readlinkSync(localPath)
    return target === expectedIcloudPath
  } catch {
    return false
  }
}

/**
 * Scan the github root for all .env files (both regular files and symlinks)
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
    const projectPath = dirname(relativePath)
    const icloudPath = getEnvFilePath(projectPath, fileName)

    const inIcloud = fs.existsSync(icloudPath)
    const isSymlinked = isValidSymlink(absolutePath, icloudPath)

    return {
      absolutePath,
      fileName,
      icloudPath,
      inIcloud,
      isSymlinked,
      relativePath,
    }
  })
}

/**
 * List all env files stored in iCloud (source of truth)
 */
export function listIcloudEnvFiles(): EnvFile[] {
  const envFilesDir = PATHS.icloudEnvFiles
  const envFiles: EnvFile[] = []

  if (!fs.existsSync(envFilesDir)) {
    return []
  }

  function scanIcloudDirectory(dir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true})
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)

      if (entry.isDirectory()) {
        scanIcloudDirectory(fullPath)
      } else if (entry.isFile() && ENV_FILE_PATTERNS.has(entry.name)) {
        const relativePath = relative(envFilesDir, fullPath)
        const absolutePath = join(PATHS.githubRoot, relativePath)

        const isSymlinked = isValidSymlink(absolutePath, fullPath)

        envFiles.push({
          absolutePath,
          fileName: entry.name,
          icloudPath: fullPath,
          inIcloud: true,
          isSymlinked,
          relativePath,
        })
      }
    }
  }

  scanIcloudDirectory(envFilesDir)
  return envFiles
}

/**
 * Get comprehensive status of all env files
 */
export function getEnvFilesStatus(githubRoot: string = PATHS.githubRoot): EnvFileStatus[] {
  // Get files from both sources
  const localFiles = scanForEnvFiles(githubRoot)
  const icloudFiles = listIcloudEnvFiles()

  // Build a map of all files by relative path
  const fileMap = new Map<string, EnvFileStatus>()

  // Process local files
  for (const file of localFiles) {
    let status: EnvFileStatus['status'] = 'unsynced'
    let localHash: string | undefined
    let icloudHash: string | undefined
    let hasLocalFile = false

    try {
      const stat = fs.lstatSync(file.absolutePath)
      hasLocalFile = !stat.isSymbolicLink()

      if (hasLocalFile) {
        const content = fs.readFileSync(file.absolutePath, 'utf8')
        localHash = hashContent(content)
      }
    } catch {
      // File might have been deleted
    }

    if (file.inIcloud) {
      try {
        const content = fs.readFileSync(file.icloudPath, 'utf8')
        icloudHash = hashContent(content)
      } catch {
        // iCloud file might have been deleted
      }
    }

    // Determine status
    if (file.isSymlinked && file.inIcloud) {
      status = 'synced'
    } else if (hasLocalFile && file.inIcloud) {
      // Both exist - check for conflict
      status = localHash && icloudHash && localHash !== icloudHash ? 'conflict' : 'regular-file';
    } else if (hasLocalFile && !file.inIcloud) {
      status = 'unsynced'
    } else if (!hasLocalFile && file.inIcloud) {
      status = 'synced' // Symlink or orphaned
    }

    fileMap.set(file.relativePath, {
      ...file,
      hasLocalFile,
      icloudHash,
      localHash,
      status,
    })
  }

  // Add iCloud-only files (orphaned - exist in iCloud but no symlink locally)
  for (const file of icloudFiles) {
    if (!fileMap.has(file.relativePath)) {
      let icloudHash: string | undefined
      try {
        const content = fs.readFileSync(file.icloudPath, 'utf8')
        icloudHash = hashContent(content)
      } catch {
        // iCloud file might have been deleted
      }

      fileMap.set(file.relativePath, {
        ...file,
        hasLocalFile: false,
        icloudHash,
        localHash: undefined,
        status: 'orphaned',
      })
    }
  }

  return [...fileMap.values()]
}

/**
 * Sync a single env file: move to iCloud and create symlink
 */
export function syncEnvFile(envFile: EnvFile, force = false): SyncResult {
  const {absolutePath, icloudPath} = envFile

  try {
    // Check if already synced
    if (envFile.isSymlinked && envFile.inIcloud) {
      return {action: 'skipped', envFile, success: true}
    }

    // Check if local file exists and is not a symlink
    let hasLocalFile = false
    let localContent: string | undefined

    try {
      const stat = fs.lstatSync(absolutePath)
      if (stat.isSymbolicLink()) {
        // Remove invalid symlink
        fs.unlinkSync(absolutePath)
      } else {
        hasLocalFile = true
        localContent = fs.readFileSync(absolutePath, 'utf8')
      }
    } catch {
      // Local file doesn't exist
    }

    // Check if iCloud file exists
    let icloudContent: string | undefined
    if (envFile.inIcloud) {
      try {
        icloudContent = fs.readFileSync(icloudPath, 'utf8')
      } catch {
        // iCloud file might have been deleted
      }
    }

    // Handle conflict: both local and iCloud exist with different content
    if (hasLocalFile && icloudContent && localContent !== icloudContent && !force) {
      return {
        action: 'conflict',
        envFile,
        error: 'Local file and iCloud file have different content. Use --force to overwrite iCloud.',
        success: false,
      }
    }

    // Ensure iCloud directory exists
    fs.mkdirSync(dirname(icloudPath), {recursive: true})

    // If local file exists, move it to iCloud (or skip if iCloud already has same content)
    if (hasLocalFile && localContent) {
      if (!icloudContent || force) {
        // Write local content to iCloud
        fs.writeFileSync(icloudPath, localContent, 'utf8')
      }

      // Remove local file
      fs.unlinkSync(absolutePath)
    }

    // If no iCloud file exists and no local file, this is an orphaned reference
    if (!fs.existsSync(icloudPath)) {
      return {
        action: 'skipped',
        envFile,
        error: 'No source file found',
        success: false,
      }
    }

    // Create symlink
    fs.symlinkSync(icloudPath, absolutePath)

    return {
      action: hasLocalFile ? 'created' : 'linked',
      envFile,
      success: true,
    }
  } catch (error) {
    return {
      action: 'skipped',
      envFile,
      error: error instanceof Error ? error.message : String(error),
      success: false,
    }
  }
}

/**
 * Sync all env files: move to iCloud and create symlinks
 */
export function syncAllEnvFiles(
  githubRoot: string = PATHS.githubRoot,
  force = false,
): {conflicts: number; failed: number; results: SyncResult[]; synced: number} {
  const envFiles = scanForEnvFiles(githubRoot)
  const results: SyncResult[] = []
  let synced = 0
  let failed = 0
  let conflicts = 0

  for (const envFile of envFiles) {
    const result = syncEnvFile(envFile, force)
    results.push(result)

    if (result.success) {
      if (result.action !== 'skipped') {
        synced++
      }
    } else if (result.action === 'conflict') {
      conflicts++
    } else {
      failed++
    }
  }

  return {conflicts, failed, results, synced}
}

/**
 * Link orphaned iCloud env files to their project locations
 */
export function linkOrphanedEnvFiles(): SyncResult[] {
  const icloudFiles = listIcloudEnvFiles()
  const results: SyncResult[] = []

  for (const envFile of icloudFiles) {
    if (!envFile.isSymlinked) {
      // Check if local path exists
      try {
        const stat = fs.lstatSync(envFile.absolutePath)
        if (stat.isSymbolicLink()) {
          // Remove invalid symlink
          fs.unlinkSync(envFile.absolutePath)
        } else {
          // Local file exists - skip (conflict)
          results.push({
            action: 'conflict',
            envFile,
            error: 'Local file exists',
            success: false,
          })
          continue
        }
      } catch {
        // Local file doesn't exist - good
      }

      // Ensure parent directory exists
      fs.mkdirSync(dirname(envFile.absolutePath), {recursive: true})

      // Create symlink
      try {
        fs.symlinkSync(envFile.icloudPath, envFile.absolutePath)
        results.push({action: 'linked', envFile, success: true})
      } catch (error) {
        results.push({
          action: 'skipped',
          envFile,
          error: error instanceof Error ? error.message : String(error),
          success: false,
        })
      }
    }
  }

  return results
}
