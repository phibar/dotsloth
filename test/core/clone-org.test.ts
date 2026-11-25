import {execFileSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {expect} from 'chai'

import type {OrgCloneEvent} from '../../src/core/clone-org.js'
import {cloneOrg, planOrgClone} from '../../src/core/clone-org.js'
import {replaceConfig} from '../../src/core/config.js'
import {getOrg} from '../../src/core/orgs.js'
import {getDefaultConfig} from '../../src/lib/config.js'
import {PATHS} from '../../src/lib/paths.js'
import {codeOf, makeRepo} from '../__testdata__/repos.js'
import {EMPTY_SYSTEM, fakeBinaries, resetHome} from '../helpers.js'

/**
 * Purpose: an organisation's repositories, or those with given topics, land
 * in its org folder in one run; a re-run or a failed repository leaves the
 * rest of the batch as it should be.
 *
 * Intention: a shell stand-in for gh prints the listing from $FAKE_GH_REPOS;
 * git rewrites git@example.test: to local bare repositories, so nothing
 * leaves the machine.
 */
describe('core/clone-org', () => {
  const acme = {folderName: 'acme', gitEmail: 'dev@acme.test', gitUsername: 'dev', name: 'acme'}
  let sources: string
  let restorePath: () => void

  const listing = [
    {
      isArchived: false,
      isFork: false,
      name: 'kernel',
      repositoryTopics: [{name: '0field'}],
      sshUrl: 'git@example.test:acme/kernel.git',
    },
    {
      isArchived: false,
      isFork: false,
      name: 'design',
      repositoryTopics: [{name: 'ui'}, {name: '0field'}],
      sshUrl: 'git@example.test:acme/design.git',
    },
    {
      isArchived: false,
      isFork: false,
      name: 'site',
      repositoryTopics: [{name: 'web'}],
      sshUrl: 'git@example.test:acme/site.git',
    },
    {
      isArchived: false,
      isFork: false,
      name: 'plain',
      repositoryTopics: null,
      sshUrl: 'git@example.test:acme/plain.git',
    },
    {
      isArchived: true,
      isFork: false,
      name: 'old',
      repositoryTopics: [{name: '0field'}],
      sshUrl: 'git@example.test:acme/old.git',
    },
    {
      isArchived: false,
      isFork: true,
      name: 'forked',
      repositoryTopics: [{name: '0field'}],
      sshUrl: 'git@example.test:acme/forked.git',
    },
    {
      isArchived: false,
      isFork: false,
      name: 'gone',
      repositoryTopics: [{name: 'ui'}],
      sshUrl: 'git@example.test:acme/gone.git',
    },
  ]

  function writeListing(repos: unknown): void {
    fs.writeFileSync(path.join(sources, 'gh.json'), JSON.stringify(repos), 'utf8')
  }

  beforeEach(() => {
    resetHome()
    restorePath = fakeBinaries({...EMPTY_SYSTEM, gh: 'cat "$FAKE_GH_REPOS"'})
    replaceConfig({...getDefaultConfig(), organizations: [acme]})

    sources = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-sources-'))
    const work = path.join(sources, 'work')
    makeRepo(work)
    // Every listed repository but `gone` exists.
    for (const repo of listing.filter((r) => r.name !== 'gone')) {
      execFileSync('git', ['clone', '-q', '--bare', work, path.join(sources, 'acme', `${repo.name}.git`)], {
        stdio: 'pipe',
      })
    }

    writeListing(listing)
    Object.assign(process.env, {
      FAKE_GH_REPOS: path.join(sources, 'gh.json'),
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: `url.file://${sources}/.insteadOf`,
      GIT_CONFIG_VALUE_0: 'git@example.test:',
    })
  })

  afterEach(() => {
    restorePath()
    for (const key of ['FAKE_GH_REPOS', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0'])
      delete process.env[key]
    fs.rmSync(sources, {force: true, recursive: true})
  })

  const names = (plan: {repos: Array<{name: string}>}) => plan.repos.map((r) => r.name)

  it('matches any of the topics and leaves out archived repositories and forks unless asked', async () => {
    expect(names(await planOrgClone('acme', {topics: ['0field']}))).to.deep.equal(['design', 'kernel'])
    expect(names(await planOrgClone('acme', {topics: ['0FIELD', 'web']}))).to.deep.equal(['design', 'kernel', 'site'])
    expect(names(await planOrgClone('acme'))).to.deep.equal(['design', 'gone', 'kernel', 'plain', 'site'])
    expect(
      names(await planOrgClone('acme', {includeArchived: true, includeForks: true, topics: ['0field']})),
    ).to.deep.equal(['design', 'forked', 'kernel', 'old'])
  })

  it('plans the org folder, the configured org and what is already local', async () => {
    fs.mkdirSync(path.join(PATHS.githubRoot, 'acme', 'kernel'), {recursive: true})
    const plan = await planOrgClone('acme', {topics: ['0field']})

    expect(plan.org).to.deep.equal(acme)
    expect(plan.repos.map((r) => [r.name, r.local])).to.deep.equal([
      ['design', false],
      ['kernel', true],
    ])
    expect(plan.repos[0].repoPath).to.equal(path.join(PATHS.githubRoot, 'acme', 'design'))
  })

  it('refuses an owner that is no GitHub login and a listing that is not what gh gives', async () => {
    expect(await codeOf(planOrgClone('--help'))).to.equal('INVALID_INPUT')
    expect(await codeOf(planOrgClone('a/b'))).to.equal('INVALID_INPUT')

    writeListing([{...listing[0], sshUrl: 'ext::sh -c touch% /tmp/pwned'}])
    expect(await codeOf(planOrgClone('acme'))).to.equal('COMMAND_FAILED')
    writeListing([{...listing[0], name: '../escape'}])
    expect(await codeOf(planOrgClone('acme'))).to.equal('COMMAND_FAILED')
  })

  it('clones the matching repositories, skips local ones and goes on after a failure', async () => {
    fs.mkdirSync(path.join(PATHS.githubRoot, 'acme', 'kernel'), {recursive: true})
    const events: OrgCloneEvent[] = []
    const result = await cloneOrg('acme', {topics: ['0field', 'ui']}, (event) => events.push(event))

    expect(result.cloned).to.deep.equal(['design'])
    expect(result.local).to.deep.equal(['kernel'])
    expect(result.failed.map((f) => f.name)).to.deep.equal(['gone'])
    expect(fs.existsSync(path.join(PATHS.githubRoot, 'acme', 'design', 'README.md'))).to.equal(true)
    expect(events.filter((e) => e.type === 'repo').map((e) => e.type === 'repo' && e.total)).to.deep.equal([3, 3, 3])
    expect(events.at(-1)).to.deep.equal({type: 'topics'})
  })

  it('clones only the names picked, and refuses a name the filter does not match', async () => {
    const result = await cloneOrg('acme', {repos: ['site'], topics: ['web']})
    expect(result.cloned).to.deep.equal(['site'])
    expect(fs.existsSync(path.join(PATHS.githubRoot, 'acme', 'kernel'))).to.equal(false)

    expect(await codeOf(cloneOrg('acme', {repos: ['kernel'], topics: ['web']}))).to.equal('INVALID_INPUT')
  })

  it('a second run clones nothing and reports every repository as local', async () => {
    await cloneOrg('acme', {topics: ['0field']})
    const again = await cloneOrg('acme', {topics: ['0field']})
    expect(again.cloned).to.deep.equal([])
    expect(again.local).to.deep.equal(['design', 'kernel'])
  })

  it('links the cloned repositories under their topics', async () => {
    await cloneOrg('acme', {topics: ['0field']})
    const link = path.join(PATHS.githubRoot, 'topics', '0field', 'kernel')
    expect(fs.realpathSync(link)).to.equal(fs.realpathSync(path.join(PATHS.githubRoot, 'acme', 'kernel')))
  })

  it('asks for a target when the owner is no configured org, once for the batch', async () => {
    replaceConfig({...getDefaultConfig(), organizations: []})
    expect(await codeOf(cloneOrg('acme', {topics: ['web']}))).to.equal('ORG_NOT_FOUND')

    const result = await cloneOrg('acme', {
      target: {gitEmail: 'a@x.test', gitUsername: 'a', kind: 'new-org'},
      topics: ['0field'],
    })
    expect(result.createdOrg).to.equal(true)
    expect(result.cloned).to.deep.equal(['design', 'kernel'])
    expect(getOrg('acme').gitEmail).to.equal('a@x.test')
  })
})
