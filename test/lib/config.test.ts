import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {expect} from 'chai'

// Create mock paths before importing config module
const testDir = path.join(os.tmpdir(), `dotsloth-test-${Date.now()}`)
const icloudDotsloth = path.join(testDir, 'icloud/dotsloth')
const icloudDotfiles = path.join(testDir, 'icloud/dotsloth/dotfiles')
const icloudOrganizations = path.join(testDir, 'icloud/dotsloth/organizations')
const icloudConfig = path.join(testDir, 'icloud/dotsloth/config.json')
const githubRoot = path.join(testDir, 'github')

describe('config', function () {
  before(function () {
    // Create test directories
    fs.mkdirSync(icloudDotsloth, {recursive: true})
    fs.mkdirSync(icloudDotfiles, {recursive: true})
    fs.mkdirSync(icloudOrganizations, {recursive: true})
    fs.mkdirSync(githubRoot, {recursive: true})
  })

  after(function () {
    // Clean up test directories
    fs.rmSync(testDir, {force: true, recursive: true})
  })

  describe('runFullSync', function () {
    it('should regenerate main gitconfig when organization is added', async function () {
      // Import dynamically to use mocked paths
      const {generateMainGitconfig} = await import('../../src/lib/git.js')

      // Create a mock config
      const config = {
        organizations: [
          {
            folderName: 'TestOrg',
            gitEmail: 'test@example.com',
            gitUsername: 'testuser',
            name: 'TestOrg',
          },
        ],
        paths: {
          githubRoot,
        },
        sshSigning: {
          defaultKeyPath: path.join(testDir, '.ssh/id_ed25519'),
          enabled: false,
        },
        syncedFiles: [],
        version: 1 as const,
      }

      // Generate the gitconfig content
      const gitconfigContent = generateMainGitconfig(config, 'testuser')

      // Verify the gitconfig contains includeIf for the organization
      expect(gitconfigContent).to.include('[includeIf')
      expect(gitconfigContent).to.include('TestOrg')
      expect(gitconfigContent).to.include('[user]')
      expect(gitconfigContent).to.include('name = testuser')
    })

    it('should include organization path in includeIf pattern', async function () {
      const {generateMainGitconfig} = await import('../../src/lib/git.js')

      const config = {
        organizations: [
          {
            folderName: 'MyOrg',
            gitEmail: 'myorg@example.com',
            gitUsername: 'myorguser',
            name: 'MyOrg',
          },
        ],
        paths: {
          githubRoot: '/Users/test/github',
        },
        sshSigning: {
          defaultKeyPath: '/Users/test/.ssh/id_ed25519',
          enabled: false,
        },
        syncedFiles: [],
        version: 1 as const,
      }

      const gitconfigContent = generateMainGitconfig(config, 'myorguser')

      // Verify the includeIf pattern includes the correct path
      expect(gitconfigContent).to.include('[includeIf "gitdir:/Users/test/github/MyOrg/"]')
    })
  })
})
