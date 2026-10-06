import {expect} from 'chai'

import type {MailRule, MailSignature} from '../../src/lib/mail.js'

import {asLiteral, howToAdd, ruleScript, signatureScript} from '../../src/lib/mail.js'

/**
 * Restore generates AppleScript with signature bodies and rule expressions
 * embedded in it, so escaping is both a correctness problem and the only thing
 * between a rule expression and arbitrary code execution.
 */
describe('asLiteral', () => {
  it('quotes a plain string', () => {
    expect(asLiteral('hello')).to.equal('"hello"')
  })

  it('escapes double quotes so the literal does not end early', () => {
    expect(asLiteral('say "hi"')).to.equal(String.raw`"say \"hi\""`)
  })

  it('escapes backslashes before quotes, not after', () => {
    // A naive implementation that escapes quotes first turns \" into \\" and
    // breaks out of the literal.
    expect(asLiteral(String.raw`back\slash`)).to.equal(String.raw`"back\\slash"`)
    // A value ending in a backslash: the classic case that breaks a naive escaper.
    expect(asLiteral('trailing\\')).to.equal(String.raw`"trailing\\"`)
  })

  it('rebuilds newlines with linefeed, which AppleScript cannot escape', () => {
    expect(asLiteral('one\ntwo')).to.equal('"one" & linefeed & "two"')
  })

  it('normalises CRLF the same way', () => {
    expect(asLiteral('one\r\ntwo')).to.equal('"one" & linefeed & "two"')
  })

  it('contains an injection attempt rather than closing the literal', () => {
    const hostile = '" & (do shell script "echo pwned") & "'
    const out = asLiteral(hostile)

    expect(out.startsWith('"')).to.equal(true)
    expect(out.endsWith('"')).to.equal(true)

    // The invariant that matters: no UNESCAPED quote survives inside the
    // literal, so the payload can never close it and run as code. Checking for
    // the raw substring would be wrong - the escaped form still contains it.
    const inner = out.slice(1, -1)
    const withoutEscapes = inner.replaceAll('\\\\', '').replaceAll(String.raw`\"`, '')
    expect(withoutEscapes).to.not.include('"')
  })

  it('handles an empty string', () => {
    expect(asLiteral('')).to.equal('""')
  })
})

describe('signatureScript', () => {
  const sig: MailSignature = {content: 'Philipp\n\nphibar.work', name: 'Standard'}

  it('guards against recreating an existing signature', () => {
    expect(signatureScript(sig)).to.include('if not (exists signature "Standard")')
  })

  it('embeds multi-line content via linefeed', () => {
    expect(signatureScript(sig)).to.include('"Philipp" & linefeed & "" & linefeed & "phibar.work"')
  })
})

describe('ruleScript', () => {
  const rule: MailRule = {
    allConditions: false,
    conditions: [
      {expression: 'noreply@me.com', qualifier: 'does contain value', ruleType: 'from header'},
      {expression: 'Result of Funds Transfer (Success)', qualifier: 'does contain value', ruleType: 'subject header'},
    ],
    enabled: false,
    moveTo: null,
    name: 'News From Apple',
  }

  it('guards against recreating an existing rule', () => {
    expect(ruleScript(rule)).to.include('if not (exists rule "News From Apple")')
  })

  it('carries the enabled and all-conditions flags through', () => {
    const out = ruleScript(rule)
    expect(out).to.include('enabled:false')
    expect(out).to.include('all conditions must be met:false')
  })

  it('emits one condition per stored condition', () => {
    const out = ruleScript(rule)
    expect(out.split('make new rule condition')).to.have.lengthOf(3) // 2 conditions
    expect(out).to.include('rule type:from header')
    expect(out).to.include('qualifier:does contain value')
    expect(out).to.include('"noreply@me.com"')
  })

  it('does not quote rule type or qualifier, which are AppleScript enums', () => {
    // Quoting these would make Mail reject the rule at creation time.
    expect(ruleScript(rule)).to.not.include('rule type:"from header"')
    expect(ruleScript(rule)).to.not.include('qualifier:"does contain value"')
  })

  it('handles a rule with no conditions', () => {
    const out = ruleScript({...rule, conditions: []})
    expect(out).to.include('make new rule')
    expect(out).to.not.include('make new rule condition')
  })
})

describe('howToAdd', () => {
  const base = {emails: [], name: 'x', port: null, server: null, user: 'u'}

  it('sends iCloud accounts to the Apple Account pane, not Mail', () => {
    expect(howToAdd({...base, type: 'iCloud'})).to.include('Apple Account')
  })

  it('names the server for a plain IMAP account', () => {
    expect(howToAdd({...base, port: 993, server: 'imap.gmail.com', type: 'imap'})).to.include('imap.gmail.com:993')
  })

  it('treats an unknown type as Exchange, which is how Mail reports it', () => {
    expect(howToAdd({...base, type: 'unknown'})).to.include('Exchange')
  })
})
