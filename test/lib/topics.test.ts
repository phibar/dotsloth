/*
 * Purpose: Pin the promises of src/lib/topics.ts.
 * Intention: uses a temp githubRoot to avoid touching the real ~/github/topics.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {expect} from 'chai'

import {buildTopicMap, pruneTopicSymlinks, syncTopicSymlinks} from '../../src/lib/topics.js'

function makeRepo(root: string, org: string, name: string): string {
  const repoPath = path.join(root, org, name)
  fs.mkdirSync(repoPath, {recursive: true})
  return repoPath
}

describe('topics', () => {
  let root: string
  let topicsRoot: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-topics-'))
    topicsRoot = path.join(root, 'topics')
  })

  afterEach(() => {
    fs.rmSync(root, {force: true, recursive: true})
  })

  describe('buildTopicMap', () => {
    it('inverts a repo→topics map into topic→repoPaths', () => {
      const repoTopics = new Map([
        ['/github/phibar/dotsloth', ['typescript', 'cli']],
        ['/github/phibar/other', ['typescript']],
      ])

      const result = buildTopicMap(repoTopics)

      expect(result.get('typescript')).to.deep.equal(['/github/phibar/dotsloth', '/github/phibar/other'])
      expect(result.get('cli')).to.deep.equal(['/github/phibar/dotsloth'])
    })

    it('returns an empty map when no repos have topics', () => {
      expect(buildTopicMap(new Map()).size).to.equal(0)
    })
  })

  describe('syncTopicSymlinks', () => {
    it('creates a symlink for each repo under its topic', () => {
      const repoPath = makeRepo(root, 'phibar', 'dotsloth')
      const topicMap = new Map([['typescript', [repoPath]]])
      syncTopicSymlinks({dryRun: false, topicMap, topicsRoot})

      const linkPath = path.join(topicsRoot, 'typescript', 'dotsloth')
      expect(fs.lstatSync(linkPath).isSymbolicLink()).to.equal(true)
      expect(fs.readlinkSync(linkPath)).to.equal(path.relative(path.join(topicsRoot, 'typescript'), repoPath))
    })

    it('uses org-repo name when two repos share the same basename', () => {
      const repoA = makeRepo(root, 'phibar', 'api')
      const repoB = makeRepo(root, 'exram', 'api')
      const topicMap = new Map([['backend', [repoA, repoB]]])
      syncTopicSymlinks({dryRun: false, topicMap, topicsRoot})

      const names = fs.readdirSync(path.join(topicsRoot, 'backend'))
      expect(names).to.include('api')
      expect(names).to.include('exram-api')
    })

    it('reports steps without touching the filesystem in dry-run mode', () => {
      const repoPath = makeRepo(root, 'phibar', 'dotsloth')
      const topicMap = new Map([['cli', [repoPath]]])
      const steps = syncTopicSymlinks({dryRun: true, topicMap, topicsRoot})

      expect(steps[0].ok).to.equal(true)
      expect(fs.existsSync(topicsRoot)).to.equal(false)
    })

    it('is idempotent — running twice creates no duplicate entries', () => {
      const repoPath = makeRepo(root, 'phibar', 'dotsloth')
      const topicMap = new Map([['cli', [repoPath]]])
      syncTopicSymlinks({dryRun: false, topicMap, topicsRoot})
      syncTopicSymlinks({dryRun: false, topicMap, topicsRoot})

      const links = fs.readdirSync(path.join(topicsRoot, 'cli'))
      expect(links).to.have.lengthOf(1)
    })
  })

  describe('pruneTopicSymlinks', () => {
    let cliRepo: string
    let cliTopicMap: Map<string, string[]>

    beforeEach(() => {
      cliRepo = makeRepo(root, 'phibar', 'dotsloth')
      cliTopicMap = new Map([['cli', [cliRepo]]])
      syncTopicSymlinks({dryRun: false, topicMap: cliTopicMap, topicsRoot})
    })

    it('removes a symlink whose repo is no longer in the topic map', () => {
      const steps = pruneTopicSymlinks({dryRun: false, topicMap: new Map(), topicsRoot})

      expect(steps[0].ok).to.equal(true)
      expect(steps[0].label).to.include('removed')
    })

    it('removes an empty topic dir after pruning its last symlink', () => {
      pruneTopicSymlinks({dryRun: false, topicMap: new Map(), topicsRoot})

      expect(fs.existsSync(path.join(topicsRoot, 'cli'))).to.equal(false)
    })

    it('keeps a symlink that is still in the topic map', () => {
      const steps = pruneTopicSymlinks({dryRun: false, topicMap: cliTopicMap, topicsRoot})

      expect(steps).to.have.lengthOf(0)
      expect(fs.existsSync(path.join(topicsRoot, 'cli', 'dotsloth'))).to.equal(true)
    })

    it('returns empty when topicsRoot does not exist', () => {
      const steps = pruneTopicSymlinks({dryRun: false, topicMap: new Map(), topicsRoot: path.join(root, 'nonexistent')})
      expect(steps).to.have.lengthOf(0)
    })
  })
})
