import * as fs from 'node:fs'
import * as path from 'node:path'
import {expect} from 'chai'

import type {DoctorEvent} from '../../src/core/doctor.js'
import {runDoctor} from '../../src/core/doctor.js'
import {PATHS} from '../../src/lib/paths.js'
import {makeRepo} from '../__testdata__/repos.js'
import {resetHome} from '../helpers.js'

/**
 * Purpose: the doctor names every repository and env file a wipe would
 * lose, and reports nothing where nothing is at risk.
 *
 * Intention: repositories with work only on this machine and unsaved
 * env files are laid out by __testdata__/repos under the throwaway
 * HOME's GitHub root.
 */
describe('core/doctor', () => {
  beforeEach(() => resetHome())

  it('is safe when there is nothing under the GitHub root', async () => {
    const report = await runDoctor({offline: true})
    expect(report).to.include({icloudPending: 0, problems: 0, repoCount: 0, safe: true})
  })

  it('reports repos at risk and unsaved env files, with progress per repo', async () => {
    const dirty = path.join(PATHS.githubRoot, 'acme', 'dirty')
    makeRepo(dirty)
    fs.writeFileSync(path.join(dirty, 'README.md'), 'changed\n', 'utf8')
    fs.writeFileSync(path.join(dirty, '.env'), 'X=1\n', 'utf8')

    const events: DoctorEvent[] = []
    const report = await runDoctor({offline: true}, (event) => events.push(event))

    expect(events[0]).to.deep.include({offline: true, repoCount: 1, type: 'start'})
    expect(events[1]).to.deep.include({done: 1, total: 1, type: 'repo'})
    expect(report.repos.map((r) => [r.relativePath, r.dirty])).to.deep.equal([[path.join('acme', 'dirty'), 1]])
    expect(report.envFiles.map((e) => e.key)).to.deep.equal(['acme/dirty/.env'])
    expect(report).to.include({problems: 2, safe: false})
  })
})
