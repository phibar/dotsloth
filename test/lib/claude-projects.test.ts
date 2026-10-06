import {expect} from 'chai'

import {slugify} from '../../src/lib/claude-projects.js'

/**
 * These are the real directory names observed under ~/.claude/projects.
 * The mapping is lossy, so getting it right in the forward direction is the
 * only thing standing between memory sync and silently mis-filing it.
 */
describe('claude-projects slugify', () => {
  const cases: Array<[string, string]> = [
    ['/Users/phibar/github/ExRam/ExRam.Taxikomm24.Backend', '-Users-phibar-github-ExRam-ExRam-Taxikomm24-Backend'],
    // A leading dot doubles the dash — the directory is ".github-private"
    ['/Users/phibar/github/metatrom-ag/.github-private', '-Users-phibar-github-metatrom-ag--github-private'],
    ['/Users/phibar/github/phibar-work/phibar.work', '-Users-phibar-github-phibar-work-phibar-work'],
    ['/Users/phibar/github/phibar/coins', '-Users-phibar-github-phibar-coins'],
    [
      '/Users/phibar/Library/Mobile Documents/com~apple~CloudDocs/phibar.work',
      '-Users-phibar-Library-Mobile-Documents-com-apple-CloudDocs-phibar-work',
    ],
  ]

  for (const [input, expected] of cases) {
    it(`maps ${input}`, () => {
      expect(slugify(input)).to.equal(expected)
    })
  }

  it('is lossy: distinct paths can share a slug', () => {
    // This is precisely why the slug must never be parsed back into a path,
    // and why the store is keyed by git remote instead.
    expect(slugify('/a/b-c')).to.equal(slugify('/a/b.c'))
    expect(slugify('/a/b/c')).to.equal(slugify('/a/b-c'))
  })
})
