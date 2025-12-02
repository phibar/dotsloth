import {expect} from 'chai'
import {randomUUID} from 'node:crypto'
import * as fs from 'node:fs'
import {join} from 'node:path'

import {
  getEnvFilesStatus,
  listIcloudEnvFiles,
  scanForEnvFiles,
  syncEnvFile,
} from '../../src/lib/env.js'
import {getEnvFilePath, PATHS} from '../../src/lib/paths.js'

describe('env', () => {
  const testDir = `/tmp/dotsloth-test-${randomUUID()}`
  const testGithubRoot = join(testDir, 'github')
  const testIcloudEnvFiles = join(testDir, 'icloud-envfiles')

  // Store original PATHS values
  const originalGithubRoot = PATHS.githubRoot
  const originalIcloudEnvFiles = PATHS.icloudEnvFiles

  before(() => {
    // Create test directories
    fs.mkdirSync(join(testGithubRoot, 'my-org', 'my-repo'), {recursive: true})

    // Create test .env files
    fs.writeFileSync(join(testGithubRoot, 'my-org', 'my-repo', '.env'), 'API_KEY=test123')
    fs.writeFileSync(
      join(testGithubRoot, 'my-org', 'my-repo', '.env.local'),
      'LOCAL_VAR=local123',
    )

    // Override PATHS for testing (using Object.defineProperty to avoid 'any' cast)
    Object.defineProperty(PATHS, 'githubRoot', {value: testGithubRoot, writable: true})
    Object.defineProperty(PATHS, 'icloudEnvFiles', {value: testIcloudEnvFiles, writable: true})
  })

  after(() => {
    // Restore original PATHS
    Object.defineProperty(PATHS, 'githubRoot', {value: originalGithubRoot, writable: true})
    Object.defineProperty(PATHS, 'icloudEnvFiles', {value: originalIcloudEnvFiles, writable: true})

    // Clean up test directories
    fs.rmSync(testDir, {force: true, recursive: true})
  })

  describe('scanForEnvFiles', () => {
    it('should find .env files in the github root', () => {
      const envFiles = scanForEnvFiles(testGithubRoot)

      expect(envFiles).to.have.lengthOf(2)
      expect(envFiles.map((f) => f.fileName)).to.include('.env')
      expect(envFiles.map((f) => f.fileName)).to.include('.env.local')
    })

    it('should return relative paths', () => {
      const envFiles = scanForEnvFiles(testGithubRoot)

      const dotEnvFile = envFiles.find((f) => f.fileName === '.env')
      expect(dotEnvFile?.relativePath).to.equal('my-org/my-repo/.env')
    })

    it('should mark files as not synced initially', () => {
      const envFiles = scanForEnvFiles(testGithubRoot)

      expect(envFiles.every((f) => f.isSymlinked === false)).to.be.true
      expect(envFiles.every((f) => f.inIcloud === false)).to.be.true
    })

    it('should return empty array for non-existent directory', () => {
      const envFiles = scanForEnvFiles('/non-existent-path')
      expect(envFiles).to.have.lengthOf(0)
    })
  })

  describe('syncEnvFile', () => {
    it('should move env file to iCloud and create symlink', () => {
      const envFiles = scanForEnvFiles(testGithubRoot)
      const dotEnvFile = envFiles.find((f) => f.fileName === '.env')

      const result = syncEnvFile(dotEnvFile!)

      expect(result.success).to.be.true
      expect(result.action).to.equal('created')

      // Verify iCloud file exists with correct content
      expect(fs.existsSync(dotEnvFile!.icloudPath)).to.be.true
      const icloudContent = fs.readFileSync(dotEnvFile!.icloudPath, 'utf8')
      expect(icloudContent).to.equal('API_KEY=test123')

      // Verify local path is now a symlink
      const stat = fs.lstatSync(dotEnvFile!.absolutePath)
      expect(stat.isSymbolicLink()).to.be.true

      // Verify symlink points to iCloud
      const target = fs.readlinkSync(dotEnvFile!.absolutePath)
      expect(target).to.equal(dotEnvFile!.icloudPath)
    })

    it('should skip already synced files', () => {
      const envFiles = scanForEnvFiles(testGithubRoot)
      const dotEnvFile = envFiles.find((f) => f.fileName === '.env')

      // File should already be synced from previous test
      const result = syncEnvFile(dotEnvFile!)

      expect(result.success).to.be.true
      expect(result.action).to.equal('skipped')
    })
  })

  describe('getEnvFilesStatus', () => {
    it('should show synced status for symlinked files', () => {
      const status = getEnvFilesStatus(testGithubRoot)
      const dotEnvStatus = status.find((f) => f.fileName === '.env')

      expect(dotEnvStatus?.isSymlinked).to.be.true
      expect(dotEnvStatus?.status).to.equal('synced')
    })

    it('should show unsynced status for regular files', () => {
      const status = getEnvFilesStatus(testGithubRoot)
      const dotEnvLocalStatus = status.find((f) => f.fileName === '.env.local')

      expect(dotEnvLocalStatus?.isSymlinked).to.be.false
      expect(dotEnvLocalStatus?.status).to.equal('unsynced')
    })
  })

  describe('listIcloudEnvFiles', () => {
    it('should list env files in iCloud', () => {
      const icloudFiles = listIcloudEnvFiles()

      expect(icloudFiles.length).to.be.greaterThanOrEqual(1)
      expect(icloudFiles.map((f) => f.fileName)).to.include('.env')
    })

    it('should show symlink status for iCloud files', () => {
      const icloudFiles = listIcloudEnvFiles()
      const dotEnvFile = icloudFiles.find((f) => f.fileName === '.env')

      expect(dotEnvFile?.isSymlinked).to.be.true
    })
  })

  describe('getEnvFilePath', () => {
    it('should generate correct iCloud path for env files', () => {
      const envPath = getEnvFilePath('my-org/my-repo', '.env')

      expect(envPath).to.include('my-org')
      expect(envPath).to.include('my-repo')
      expect(envPath).to.include('.env')
    })
  })
})
