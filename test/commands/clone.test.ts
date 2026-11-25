import {PassThrough} from 'node:stream'
import {expect} from 'chai'
import Enquirer from 'enquirer'

import {repoPicker} from '../../src/commands/clone.js'
import type {OrgRepo} from '../../src/core/clone-org.js'

/**
 * Purpose: `clone <org>`'s picker starts with every repository still missing
 * ticked, and says which are already cloned.
 *
 * Intention: runs the real Enquirer multiselect on streams of its own, out of
 * sight, and submits it the moment it runs, as Enter pressed at once; the
 * rendered output is read for the hints.
 */
describe('clone <org> picker', () => {
  const repo = (name: string, local: boolean, topics: string[] = ['0field']): OrgRepo => ({
    archived: false,
    fork: false,
    local,
    name,
    repoPath: `/gh/acme/${name}`,
    sshUrl: `git@github.com:acme/${name}.git`,
    topics,
  })
  const plan = {repos: [repo('kernel', true), repo('canvas', false), repo('demo', false, ['web'])]}

  async function submitAtOnce(): Promise<{output: string; picked: string[]}> {
    const stdin = new PassThrough() as PassThrough & {isTTY: boolean; setRawMode: () => void}
    stdin.isTTY = true
    stdin.setRawMode = () => {
      // Enquirer switches a terminal to raw mode; these streams carry no mode.
    }
    const stdout = new PassThrough() as PassThrough & {columns: number; rows: number}
    stdout.columns = 120
    stdout.rows = 40
    let output = ''
    stdout.on('data', (chunk) => {
      output += String(chunk)
    })

    // biome-ignore lint/suspicious/noExplicitAny: Enquirer's types leave out its prompt classes
    const prompt = new (Enquirer as any).MultiSelect({...repoPicker(plan), name: 'repos', stdin, stdout})
    prompt.once('run', () => prompt.submit())
    const picked = (await prompt.run()) as string[]
    return {output, picked}
  }

  it('submits every repository still missing, and none already cloned, when Enter comes at once', async () => {
    const {picked} = await submitAtOnce()
    expect(picked).to.deep.equal(['canvas', 'demo'])
  })

  it('shows "already cloned" beside a local repository and the topics beside the others', async () => {
    const {output} = await submitAtOnce()
    // biome-ignore lint/suspicious/noControlCharactersInRegex: strips the colours Enquirer draws
    const text = output.replaceAll(/\u001B\[[\d;?]*[A-Za-z]/g, '')
    expect(text).to.match(/kernel\s+already cloned/)
    expect(text).to.match(/demo\s+web/)
  })
})
