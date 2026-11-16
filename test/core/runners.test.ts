import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {expect} from 'chai'

import {CoreError} from '../../src/core/errors.js'
import {getOrg} from '../../src/core/orgs.js'
import {defaultRunnerName} from '../../src/core/runner-folders.js'
import {addRunner, listRunners, removeRunner, runnerLogs, startRunner, stopRunner} from '../../src/core/runners.js'
import {calls, installRunnerFakes, orgDir} from '../__testdata__/runner/fakes.js'

/**
 * Purpose: core/runners keeps an organization's self-hosted runners on this
 * Mac in <org folder>/.runners/<name>/ — added from a verified package,
 * registered, run as a LaunchAgent, listed with GitHub's view, read, stopped,
 * started and removed — and leaves nothing behind where an add fails.
 * Intention: runs against the throwaway HOME of test/setup.ts with the
 * stand-ins of __testdata__/runner/fakes for `gh` (GitHub's answers, after
 * its --jq), `tar` (unpacks the fake config.sh) and `launchctl` (a file per
 * loaded agent); `calls()` reads what reached the tools.
 */
describe('core/runners', () => {
  let restore: () => void
  const runnerDir = (name = 'box') => path.join(orgDir(), '.runners', name)

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

  beforeEach(() => {
    restore = installRunnerFakes()
  })

  afterEach(() => restore())

  it('adds a runner: verified package, registration with name, labels and org URL, a started LaunchAgent', async () => {
    const steps: string[] = []
    const runner = await addRunner({labels: ['e2e'], name: 'box', org: 'acme'}, (event) => {
      if (event.type === 'step') steps.push(event.label)
    })

    expect(runner).to.include({name: 'box', org: 'acme', path: runnerDir(), registered: true, running: true})
    expect(runner.serviceName).to.equal('actions.runner.acme.box')
    expect(fs.existsSync(path.join(os.homedir(), 'Library/LaunchAgents/actions.runner.acme.box.plist'))).to.equal(true)
    expect(fs.readdirSync(runnerDir()).filter((file) => file.endsWith('.tar.gz'))).to.deep.equal([])
    expect(calls()).to.include(
      'config.sh --unattended --url https://github.com/acme --token REG-TOKEN --name box --work _work --labels e2e',
    )
    expect(steps).to.deep.equal([
      'Latest runner: 9.9.9',
      'Downloaded and verified (SHA-256)',
      "Registered 'box' with acme",
      'Started as a LaunchAgent',
    ])
  })

  it('leaves the organization repo count as it was', async () => {
    const before = getOrg('acme').repoCount
    await addRunner({name: 'box', org: 'acme'})
    expect(getOrg('acme').repoCount).to.equal(before)
  })

  it("names a runner after this Mac's host, then -2, -3", () => {
    expect(defaultRunnerName([], 'Mac-Mini.local')).to.equal('mac-mini')
    expect(defaultRunnerName(['mac-mini'], 'Mac-Mini.local')).to.equal('mac-mini-2')
    expect(defaultRunnerName(['mac-mini', 'mac-mini-2'], 'Mac-Mini.local')).to.equal('mac-mini-3')
    expect(defaultRunnerName([], "Phil's MacBook")).to.equal('phil-s-macbook')
  })

  it('removes the folder it created when registration fails', async () => {
    process.env.FAKE_CONFIG_FAIL = '1'
    await expectCoreError(addRunner({name: 'box', org: 'acme'}), 'COMMAND_FAILED')
    expect(fs.existsSync(runnerDir())).to.equal(false)
  })

  it('refuses a package whose SHA-256 differs from the release notes, before unpacking it', async () => {
    process.env.FAKE_PACKAGE = 'tampered'
    const error = await expectCoreError(addRunner({name: 'box', org: 'acme'}), 'COMMAND_FAILED')
    expect(error.message).to.include('Checksum mismatch')
    expect(fs.existsSync(runnerDir())).to.equal(false)
    expect(calls().some((line) => line.startsWith('tar '))).to.equal(false)
  })

  it('refuses a personal account', async () => {
    process.env.FAKE_GH_TYPE = 'User'
    await expectCoreError(addRunner({name: 'box', org: 'acme'}), 'INVALID_INPUT')
    expect(fs.existsSync(runnerDir())).to.equal(false)
  })

  it('refuses names and labels that are no plain path segment, and a name already taken', async () => {
    await expectCoreError(addRunner({name: '../escape', org: 'acme'}), 'INVALID_INPUT')
    await expectCoreError(addRunner({labels: ['a,b'], name: 'box', org: 'acme'}), 'INVALID_INPUT')
    await addRunner({name: 'box', org: 'acme'})
    await expectCoreError(addRunner({name: 'box', org: 'acme'}), 'CONFLICT')
  })

  it("lists this Mac's runners with GitHub's view, and offline without asking GitHub", async () => {
    await addRunner({name: 'box', org: 'acme'})

    const online = await listRunners()
    expect(online.runners).to.have.length(1)
    expect(online.runners[0].github).to.deep.equal({
      busy: true,
      labels: ['self-hosted', 'e2e'],
      name: 'box',
      status: 'online',
    })

    fs.writeFileSync(process.env.FAKE_LOG as string, '')
    const offline = await listRunners({offline: true})
    expect(offline.runners[0].github).to.equal(null)
    expect(calls()).to.deep.equal([])
  })

  it('lists local runners with a warning when GitHub cannot be reached', async () => {
    await addRunner({name: 'box', org: 'acme'})
    process.env.FAKE_GH_DOWN = '1'
    const {runners, warnings} = await listRunners()
    expect(runners[0]).to.include({github: null, running: true})
    expect(warnings[0]).to.include("Could not read the runners of 'acme'")
  })

  it('stops and starts the LaunchAgent, finding the only runner without a name', async () => {
    await addRunner({name: 'box', org: 'acme'})
    expect((await stopRunner({org: 'acme'})).running).to.equal(false)
    expect((await startRunner({org: 'acme'})).running).to.equal(true)
  })

  it('asks for a name once an organization has two runners, and reports an unknown one', async () => {
    await addRunner({name: 'box', org: 'acme'})
    await addRunner({name: 'box-2', org: 'acme'})
    await expectCoreError(stopRunner({org: 'acme'}), 'INVALID_INPUT')
    await expectCoreError(stopRunner({name: 'nope', org: 'acme'}), 'NOT_FOUND')
    expect((await stopRunner({name: 'box-2', org: 'acme'})).running).to.equal(false)
  })

  it('reads the last lines of the service log', async () => {
    await addRunner({name: 'box', org: 'acme'})
    expect(runnerLogs({lines: 2, org: 'acme'}).lines).to.deep.equal(['Running job: e2e', 'Job e2e completed'])
    expect(() => runnerLogs({lines: 0, org: 'acme'})).to.throw(CoreError)
  })

  it('removes a runner: service, registration and folder', async () => {
    await addRunner({name: 'box', org: 'acme'})
    const result = await removeRunner({org: 'acme'})

    expect(result).to.deep.equal({deregistered: true, name: 'box', org: 'acme', path: runnerDir()})
    expect(calls()).to.include('config.sh remove --token RM-TOKEN')
    expect(fs.existsSync(runnerDir())).to.equal(false)
    expect(fs.existsSync(path.join(os.homedir(), 'Library/LaunchAgents/actions.runner.acme.box.plist'))).to.equal(false)
  })

  it('keeps the folder when GitHub refuses, and removes it locally with force', async () => {
    await addRunner({name: 'box', org: 'acme'})
    process.env.FAKE_GH_REFUSE = '1'

    await expectCoreError(removeRunner({org: 'acme'}), 'COMMAND_FAILED')
    expect(fs.existsSync(runnerDir())).to.equal(true)

    const result = await removeRunner({force: true, org: 'acme'})
    expect(result.deregistered).to.equal(false)
    expect(fs.existsSync(runnerDir())).to.equal(false)
  })
})
