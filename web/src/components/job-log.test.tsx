import {cleanup, render} from '@testing-library/react'
import {afterEach, describe, expect, it} from 'vitest'

import {JobLog} from './job-log.js'

/**
 * Purpose: a job's log shows git's progress in place, one line per phase,
 * while every other line stays.
 *
 * Intention: renders JobLog in jsdom with lines shaped as the clone panels
 * hand them over, and reads the text of its <pre>.
 */
describe('JobLog', () => {
  afterEach(cleanup)

  it('replaces a progress line with the line after it and keeps every other line', () => {
    const {container} = render(
      <JobLog
        lines={[
          '[1/1] Counter',
          {progress: true, text: 'Receiving objects:  50% (23/46)'},
          {progress: true, text: 'Receiving objects: 100% (46/46)'},
          'Receiving objects: 100% (46/46), done.',
          'Linking topics…',
        ]}
      />,
    )

    expect(container.querySelector('pre')?.textContent).toBe(
      '[1/1] Counter\nReceiving objects: 100% (46/46), done.\nLinking topics…',
    )
  })
})
