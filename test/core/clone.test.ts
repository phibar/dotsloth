import {execFileSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {expect} from 'chai'

import type {CloneEvent} from '../../src/core/clone.js'
import {clone, planClone} from '../../src/core/clone.js'
import {replaceConfig} from '../../src/core/config.js'
import {getOrg} from '../../src/core/orgs.js'
import {getDefaultConfig} from '../../src/lib/config.js'
import {PATHS} from '../../src/lib/paths.js'
import {codeOf, makeRepo} from '../__testdata__/repos.js'
import {EMPTY_SYSTEM, fakeBinaries, resetHome} from '../helpers.js'

const acme = {folderName: 'acme', gitEmail: 'dev@acme.test', gitUsername: 'dev', name: 'acme'}

describe('core/clone', () => {
  let sources: string
  let restorePath: () => void

  beforeEach(() => {
    resetHome()
    restorePath = fakeBinaries(EMPTY_SYSTEM)
    replaceConfig({...getDefaultConfig(), organizations: [acme]})

    // https://example.test/<org>/<repo> resolves to a local bare repository.
    sources = fs.mkdtempSync(path.join(os.tmpdir(), 'dotsloth-sources-'))
    const work = path.join(sources, 'work')
    makeRepo(work)
    for (const org of ['acme', 'stranger']) {
      execFileSync('git', ['clone', '-q', '--bare', work, path.join(sources, org, 'web.git')], {stdio: 'pipe'})
    }

    Object.assign(process.env, {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: `url.file://${sources}/.insteadOf`,
      GIT_CONFIG_VALUE_0: 'https://example.test/',
    })
  })

  afterEach(() => {
    restorePath()
    for (const key of ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0']) delete process.env[key]
    fs.rmSync(sources, {force: true, recursive: true})
  })

  it('plans: known org, unknown org, override and malformed URLs', async () => {
    expect(planClone('https://example.test/acme/web.git')).to.deep.include({org: acme, orgName: 'acme', repo: 'web'})
    expect(planClone('git@github.com:stranger/web.git')).to.deep.include({org: null, orgName: 'stranger'})
    expect(planClone('git@github.com:stranger/web.git', {org: 'ACME'}).org).to.deep.equal(acme)
    expect(await codeOf(Promise.resolve().then(() => planClone('not a url')))).to.equal('INVALID_INPUT')
  })

  it('clones into the org folder and streams git output', async () => {
    const events: CloneEvent[] = []
    const result = await clone('https://example.test/acme/web.git', {}, (event) => events.push(event))

    expect(result.repoPath).to.equal(path.join(PATHS.githubRoot, 'acme', 'web'))
    expect(fs.existsSync(path.join(result.repoPath, 'README.md'))).to.equal(true)
    expect(result.org).to.deep.equal(acme)
    expect(events[0]).to.deep.include({type: 'cloning'})
    expect(events.some((e) => e.type === 'output')).to.equal(true)
  })

  it('needs a decision for an unknown org, and honours each one', async () => {
    const url = 'https://example.test/stranger/web.git'
    expect(await codeOf(clone(url))).to.equal('ORG_NOT_FOUND')

    const plain = await clone(url, {target: {kind: 'none'}})
    expect(plain.repoPath).to.equal(path.join(PATHS.githubRoot, 'stranger', 'web'))
    expect(plain.org).to.equal(null)
    fs.rmSync(plain.repoPath, {force: true, recursive: true})

    const created = await clone(url, {target: {gitEmail: 's@x.test', gitUsername: 's', kind: 'new-org'}})
    expect(created.createdOrg).to.equal(true)
    expect(getOrg('stranger').gitEmail).to.equal('s@x.test')
  })

  it('refuses targets outside the org folder, existing folders and failed clones', async () => {
    expect(await codeOf(clone('https://example.test/acme/../../escape'))).to.equal('UNSAFE_PATH')
    expect(await codeOf(clone('https://example.test/../web', {target: {kind: 'none'}}))).to.equal('UNSAFE_PATH')

    fs.mkdirSync(path.join(PATHS.githubRoot, 'acme', 'web'), {recursive: true})
    expect(await codeOf(clone('https://example.test/acme/web.git'))).to.equal('CONFLICT')

    expect(await codeOf(clone('https://example.test/acme/missing.git'))).to.equal('COMMAND_FAILED')
  })
})
