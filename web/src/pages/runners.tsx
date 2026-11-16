/*
 * Purpose: Steer this Mac's self-hosted GitHub Actions runners from the
 * browser, as `dotsloth runner` does in the terminal (#106).
 * Intention: uses api.runners.list for the runners and GitHub's warnings;
 * composes AddRunner and one RunnerCard per runner from pages/runners/, and
 * reloads the list after each of their changes.
 */

import {api} from '../api.js'
import {ErrorNote, useLoad} from '../components/ui.js'
import {AddRunner} from './runners/add-runner.js'
import {RunnerCard} from './runners/runner-card.js'

export function RunnersPage() {
  const runners = useLoad(api.runners.list)

  return (
    <>
      <AddRunner onAdded={runners.reload} />
      {runners.error ? <ErrorNote error={runners.error} /> : null}
      {runners.data?.warnings.map((warning) => (
        <p className="warn-text" key={warning}>
          {warning}
        </p>
      ))}
      {runners.data && runners.data.runners.length === 0 && <p className="muted">No runners on this Mac yet.</p>}
      {runners.data?.runners.map((runner) => (
        <RunnerCard key={runner.path} onChange={runners.reload} runner={runner} />
      ))}
    </>
  )
}
