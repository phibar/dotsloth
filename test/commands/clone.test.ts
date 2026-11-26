import {PassThrough} from 'node:stream'
import {checkbox} from '@inquirer/prompts'
import {expect} from 'chai'

import {repoPicker} from '../../src/commands/clone.js'
import type {OrgRepo} from '../../src/core/clone-org.js'

/**
 * Purpose: `clone <org>`'s picker starts with every repository still missing
 * ticked, and says which are already cloned.
 *
 * Intention: runs the real @inquirer/prompts checkbox on streams of its own,
 * out of sight, and presses Enter once it has drawn; the rendered output is
 * read for the labels.
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

  async function enterAtOnce(): Promise<{output: string; picked: string[]}> {
    const input = new PassThrough()
    const output = new PassThrough()
    let text = ''
    let pressed = false
    output.on('data', (chunk) => {
      text += String(chunk)
      if (pressed || !text.includes('Clone which repositories?')) return
      pressed = true
      // Enter once, after the prompt has finished drawing this frame.
      setImmediate(() => input.write('\r'))
    })
    const picked = await checkbox(repoPicker(plan, 40), {input, output})
    return {output: text, picked}
  }

  it('submits every repository still missing, and none already cloned, when Enter comes at once', async () => {
    const {picked} = await enterAtOnce()
    expect(picked).to.deep.equal(['canvas', 'demo'])
  })

  it('shows "already cloned" beside a local repository and the topics beside the others', async () => {
    const {output} = await enterAtOnce()
    // biome-ignore lint/suspicious/noControlCharactersInRegex: strips the colours the prompt draws
    const text = output.replaceAll(/\u001B\[[\d;?]*[A-Za-z]/g, '')
    expect(text).to.match(/kernel\s+already cloned/)
    expect(text).to.match(/demo\s+web/)
  })

  it('lists as many repositories as the terminal has rows for, and at least seven', () => {
    expect(repoPicker(plan, 40).pageSize).to.equal(34)
    expect(repoPicker(plan, 10).pageSize).to.equal(7)
    expect(repoPicker(plan, undefined).pageSize).to.equal(7)
  })
})
