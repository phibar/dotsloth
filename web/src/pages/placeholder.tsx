import type {Section} from '../routes.js'

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
