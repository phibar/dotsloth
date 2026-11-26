import {expect} from 'chai'

import {mergeIndex} from '../../src/lib/claude-memory.js'

/**
 * Purpose: the memory index of two machines merges into one, losing no
 * line and doubling none.
 *
 * Intention: merges strings; no file is read.
 */
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
