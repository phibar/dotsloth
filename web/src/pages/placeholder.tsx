import type {Section} from '../routes.js'

/**
 * Purpose: a section not built yet names the issue that will build it.
 *
 * Intention: used by app for those sections.
 */
export function Placeholder({section}: {section: Section}) {
  return (
    <section className="card">
      <p>{section.summary}</p>
      <p className="muted">
        This page arrives with{' '}
        <a href={`https://github.com/phibar/dotsloth/issues/${section.issue}`} rel="noreferrer" target="_blank">
          #{section.issue}
        </a>
        .
      </p>
    </section>
  )
}
