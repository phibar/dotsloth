import {expect} from 'chai'

import {exitOnClosedPrompt} from '../../src/cli/base-command.js'

/**
 * Purpose: Ctrl+C in a prompt ends the command as cancelled, while every
 * other unhandled rejection still fails it as before.
 *
 * Intention: hands the handler the error Node 24 raises from Enquirer's
 * cancel, and another one, with an exit that records its code.
 */
describe('cancelling a prompt', () => {
  const closed = Object.assign(new Error('readline was closed'), {code: 'ERR_USE_AFTER_CLOSE'})

  it('exits with 130 and says "Cancelled" when Enquirer pauses its closed readline', () => {
    const exits: number[] = []
    const lines: string[] = []
    exitOnClosedPrompt(closed, {exit: (code) => exits.push(code), log: (line) => lines.push(line)})
    expect(exits).to.deep.equal([130])
    expect(lines.join('')).to.contain('Cancelled')
  })

  it('throws any other rejection on, so it still fails the command', () => {
    const other = new Error('boom')
    const exits: number[] = []
    expect(() => exitOnClosedPrompt(other, {exit: (code) => exits.push(code), log: () => exits.push(-1)})).to.throw(
      other,
    )
    expect(exits).to.deep.equal([])
  })
})
