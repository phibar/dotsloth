import {expect} from 'chai'
import * as fs from 'node:fs'
import {join} from 'node:path'

import {
  backupEnvFile,
  getEnvFilesStatus,
  listBackedUpEnvFiles,
  restoreEnvFile,
  scanForEnvFiles,
} from '../../src/lib/env.js'
import {getEnvFilePath, PATHS} from '../../src/lib/paths.js'

describe('env', () => {
  const testDir = '/tmp/dotsloth-test-' + Date.now()
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

    it('should mark files as not backed up initially', () => {
      const envFiles = scanForEnvFiles(testGithubRoot)

      expect(envFiles.every((f) => f.backedUp === false)).to.be.true
    })

    it('should return empty array for non-existent directory', () => {
      const envFiles = scanForEnvFiles('/non-existent-path')
      expect(envFiles).to.have.lengthOf(0)
    })
  })

  describe('backupEnvFile', () => {
    it('should backup an env file to iCloud', () => {
      const envFiles = scanForEnvFiles(testGithubRoot)
      const dotEnvFile = envFiles.find((f) => f.fileName === '.env')

      const result = backupEnvFile(dotEnvFile!)

      expect(result.success).to.be.true
      expect(fs.existsSync(result.backupPath)).to.be.true

      // Verify content matches
      const originalContent = fs.readFileSync(dotEnvFile!.absolutePath, 'utf8')
      const backupContent = fs.readFileSync(result.backupPath, 'utf8')
      expect(backupContent).to.equal(originalContent)
    })
  })

  describe('getEnvFilesStatus', () => {
    it('should show synced status for backed up files', () => {
      const status = getEnvFilesStatus(testGithubRoot)
      const dotEnvStatus = status.find((f) => f.fileName === '.env')

      expect(dotEnvStatus?.backedUp).to.be.true
      expect(dotEnvStatus?.synced).to.be.true
    })

    it('should show out of sync when file changes', () => {
      // Modify the local file
      const localPath = join(testGithubRoot, 'my-org', 'my-repo', '.env')
      fs.writeFileSync(localPath, 'API_KEY=changed')

      const status = getEnvFilesStatus(testGithubRoot)
      const dotEnvStatus = status.find((f) => f.fileName === '.env')

      expect(dotEnvStatus?.synced).to.be.false

      // Restore original content
      fs.writeFileSync(localPath, 'API_KEY=test123')
    })
  })

  describe('listBackedUpEnvFiles', () => {
    it('should list all backed up env files', () => {
      // First backup all files
      const envFiles = scanForEnvFiles(testGithubRoot)
      for (const file of envFiles) {
        backupEnvFile(file)
      }

      const backedUp = listBackedUpEnvFiles()

      expect(backedUp.length).to.be.greaterThanOrEqual(2)
    })
  })

  describe('restoreEnvFile', () => {
    it('should restore an env file from iCloud', () => {
      const localPath = join(testGithubRoot, 'my-org', 'my-repo', '.env')
      const originalContent = fs.readFileSync(localPath, 'utf8')

      // Delete the local file
      fs.unlinkSync(localPath)
      expect(fs.existsSync(localPath)).to.be.false

      // Restore from backup
      const backedUp = listBackedUpEnvFiles()
      const dotEnvBackup = backedUp.find((f) => f.fileName === '.env')

      const result = restoreEnvFile(dotEnvBackup!)

      expect(result.restored).to.be.true
      expect(fs.existsSync(localPath)).to.be.true

      const restoredContent = fs.readFileSync(localPath, 'utf8')
      expect(restoredContent).to.equal(originalContent)
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
