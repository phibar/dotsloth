import * as fs from 'node:fs'
import * as path from 'node:path'
import {expect} from 'chai'

import {CoreError} from '../../src/core/errors.js'
import {addOrg, getOrg, listOrgs, removeOrg, resolveOrgForPath, updateOrg} from '../../src/core/orgs.js'
import {getDefaultConfig, readConfig, saveConfig} from '../../src/lib/config.js'
import {getOrgGitconfigPath, PATHS} from '../../src/lib/paths.js'
import {EMPTY_SYSTEM, fakeBinaries, resetHome} from '../helpers.js'

async function expectCoreError(promise: Promise<unknown> | (() => unknown), code: string): Promise<CoreError> {
  try {
    await (typeof promise === 'function' ? promise() : promise)
  } catch (error) {
    expect(error).to.be.instanceOf(CoreError)
    expect((error as CoreError).code).to.equal(code)
    return error as CoreError
  }

  throw new Error(`expected CoreError ${code}`)
}

const acme = {gitEmail: 'dev@acme.test', gitUsername: 'dev', name: 'acme'}

describe('core/orgs', () => {
  let restorePath: () => void

  beforeEach(() => {
    resetHome()
    restorePath = fakeBinaries(EMPTY_SYSTEM)
  })

  afterEach(() => restorePath())

  it('adds an org: config, gitconfig, folder under the configured root, and a sync', async () => {
    const result = await addOrg(acme)

    expect(result.created).to.equal(true)
    expect(result.createdFolder).to.equal(true)
    expect(result.org.path).to.equal(path.join(PATHS.githubRoot, 'acme'))
    expect(fs.existsSync(result.org.path)).to.equal(true)
    expect(fs.readFileSync(getOrgGitconfigPath('acme'), 'utf8')).to.include('dev@acme.test')
    expect(readConfig()?.organizations).to.deep.equal([{...acme, folderName: 'acme'}])
    expect(result.sync.steps.some((s) => s.label === 'Organization acme')).to.equal(true)
  })

  it('refuses a duplicate unless overwrite is set', async () => {
    await addOrg(acme)
    await expectCoreError(addOrg({...acme, name: 'ACME'}), 'ORG_EXISTS')

    const result = await addOrg({...acme, gitEmail: 'new@acme.test'}, {overwrite: true})
    expect(result.created).to.equal(false)
    expect(getOrg('acme').gitEmail).to.equal('new@acme.test')
    expect(readConfig()?.organizations).to.have.length(1)
  })

  it('validates input before writing anything', async () => {
    const invalid = await expectCoreError(addOrg({...acme, gitEmail: 'not-an-email'}), 'INVALID_INPUT')
    expect(invalid.details.join()).to.include('gitEmail')
    await expectCoreError(addOrg({...acme, gitUsername: ' '}), 'INVALID_INPUT')
    expect(readConfig()).to.equal(null)
  })

  it('refuses org folders that are not a direct child of the GitHub root', async () => {
    for (const folderName of ['..', '.', '', '../outside', 'a/b']) {
      // biome-ignore lint/performance/noAwaitInLoops: each case must fail on its own
      await expectCoreError(addOrg({...acme, folderName}), 'UNSAFE_PATH')
    }

    expect(readConfig()?.organizations ?? []).to.deep.equal([])
  })

  it('updates only when something changed', async () => {
    await addOrg(acme)

    const unchanged = await updateOrg('ACME', {gitEmail: acme.gitEmail})
    expect(unchanged.changed).to.equal(false)
    expect(unchanged.sync).to.equal(undefined)

    const changed = await updateOrg('acme', {gitUsername: 'renamed'})
    expect(changed.changed).to.equal(true)
    expect(changed.before.gitUsername).to.equal('dev')
    expect(getOrg('acme').gitUsername).to.equal('renamed')

    await expectCoreError(updateOrg('nope', {}), 'ORG_NOT_FOUND')
    await expectCoreError(updateOrg('acme', {gitEmail: 'broken'}), 'INVALID_INPUT')
  })

  it('removes an org but keeps its repositories unless asked', async () => {
    const {org} = await addOrg(acme)
    fs.mkdirSync(path.join(org.path, 'repo'))

    const result = await removeOrg('acme')
    expect(result.deletedFolder).to.equal(false)
    expect(fs.existsSync(path.join(org.path, 'repo'))).to.equal(true)
    expect(fs.existsSync(getOrgGitconfigPath('acme'))).to.equal(false)
    expect(readConfig()?.organizations).to.deep.equal([])
  })

  it('deletes the repositories when asked', async () => {
    const {org} = await addOrg(acme)
    fs.mkdirSync(path.join(org.path, 'repo'))

    const result = await removeOrg('acme', {deleteRepos: true})
    expect(result.deletedFolder).to.equal(true)
    expect(fs.existsSync(org.path)).to.equal(false)
    expect(fs.existsSync(PATHS.githubRoot)).to.equal(true)
  })

  it('never deletes the GitHub root through a hand-edited folderName', async () => {
    saveConfig({...getDefaultConfig(), organizations: [{...acme, folderName: '.'}]})
    fs.mkdirSync(path.join(PATHS.githubRoot, 'other-org', 'repo'), {recursive: true})

    await expectCoreError(removeOrg('acme', {deleteRepos: true}), 'UNSAFE_PATH')
    expect(fs.existsSync(path.join(PATHS.githubRoot, 'other-org', 'repo'))).to.equal(true)
    expect(readConfig()?.organizations).to.have.length(1)
  })

  it('lists orgs with repo counts, ignoring hidden folders', async () => {
    const {org} = await addOrg(acme)
    fs.mkdirSync(path.join(org.path, 'one'))
    fs.mkdirSync(path.join(org.path, 'two'))
    fs.mkdirSync(path.join(org.path, '.hidden'))
    fs.writeFileSync(path.join(org.path, 'file.txt'), '')

    expect(listOrgs().map((o) => [o.name, o.exists, o.repoCount])).to.deep.equal([['acme', true, 2]])
  })

  it('resolves which org a directory belongs to', () => {
    const config = {...getDefaultConfig(), organizations: [{...acme, folderName: 'Acme'}]}

    expect(resolveOrgForPath(config, path.join(PATHS.githubRoot, 'acme', 'repo', 'src'))).to.deep.equal({
      folder: 'acme',
      org: config.organizations[0],
    })
    expect(resolveOrgForPath(config, path.join(PATHS.githubRoot, 'unknown'))?.org).to.equal(null)
    expect(resolveOrgForPath(config, PATHS.githubRoot)).to.equal(null)
    expect(resolveOrgForPath(config, `${PATHS.githubRoot}-elsewhere/acme`)).to.equal(null)
  })

  it('reports a missing config as CONFIG_MISSING', async () => {
    await expectCoreError(() => listOrgs(), 'CONFIG_MISSING')
  })
})
