import {expect} from 'chai'

import {mergeHistory} from '../../src/lib/claude-history.js'
import {mergeIndex} from '../../src/lib/claude-memory.js'

const entry = (timestamp: number, sessionId: string, display: string) =>
  JSON.stringify({display, project: '/p', sessionId, timestamp})

describe('mergeHistory', () => {
  it('unions both sides', () => {
    const a = entry(1, 's1', 'one')
    const b = entry(2, 's2', 'two')
    const merged = mergeHistory(a, b).trim().split('\n')
    expect(merged).to.have.lengthOf(2)
  })

  it('orders by timestamp regardless of argument order', () => {
    const early = entry(100, 's1', 'early')
    const late = entry(200, 's2', 'late')
    const merged = mergeHistory(late, early).trim().split('\n')
    expect(JSON.parse(merged[0]).display).to.equal('early')
    expect(JSON.parse(merged[1]).display).to.equal('late')
  })

  it('deduplicates identical entries present on both machines', () => {
    const shared = entry(1, 's1', 'same')
    const merged = mergeHistory(shared, shared).trim().split('\n')
    expect(merged).to.have.lengthOf(1)
  })

  it('does not collide entries that only look similar', () => {
    // timestamp 1 + session "23" must not key the same as timestamp 12 + "3",
    // which is what a naive string join would do.
    const a = entry(1, '23', 'x')
    const b = entry(12, '3', 'x')
    expect(mergeHistory(a, b).trim().split('\n')).to.have.lengthOf(2)
  })

  it('keeps distinct entries that share a timestamp', () => {
    const a = entry(5, 's1', 'first')
    const b = entry(5, 's2', 'second')
    expect(mergeHistory(a, b).trim().split('\n')).to.have.lengthOf(2)
  })

  it('preserves unparseable lines rather than dropping them', () => {
    const merged = mergeHistory('not json at all', entry(1, 's1', 'ok')).trim().split('\n')
    expect(merged).to.have.lengthOf(2)
    expect(merged[0]).to.equal('not json at all')
  })

  it('is idempotent', () => {
    const a = [entry(1, 's1', 'one'), entry(2, 's2', 'two')].join('\n')
    const once = mergeHistory(a, '')
    expect(mergeHistory(once, once)).to.equal(once)
  })

  it('loses nothing when one side is empty', () => {
    const a = [entry(1, 's1', 'one'), entry(2, 's2', 'two')].join('\n')
    expect(mergeHistory(a, '').trim().split('\n')).to.have.lengthOf(2)
  })
})

describe('mergeIndex', () => {
  it('unions bullet lines from both machines', () => {
    const local = '# Memory\n\n- [A](a.md) — hook a\n- [B](b.md) — hook b\n'
    const store = '# Memory\n\n- [A](a.md) — hook a\n- [C](c.md) — hook c\n'
    const merged = mergeIndex(local, store)
    expect(merged).to.include('a.md')
    expect(merged).to.include('b.md')
    expect(merged).to.include('c.md')
  })

  it('does not duplicate shared lines', () => {
    const same = '# Memory\n\n- [A](a.md) — hook\n'
    const merged = mergeIndex(same, same)
    expect(merged.split('\n').filter((l) => l.includes('a.md'))).to.have.lengthOf(1)
  })

  it('is idempotent and does not accumulate blank lines', () => {
    const local = '# Memory\n\n- [A](a.md)\n'
    const store = '# Memory\n\n- [B](b.md)\n'
    const once = mergeIndex(local, store)
    expect(mergeIndex(once, once)).to.equal(once)
  })
})
