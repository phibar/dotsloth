import {cleanup, fireEvent, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {installFakeEventSource, mockApi, renderWithToasts} from '../test-utils.js'
import {OrganizationsPage} from './orgs.js'

const ACME = {
  exists: true,
  folderName: 'acme',
  gitEmail: 'dev@acme.test',
  gitUsername: 'dev',
  name: 'acme',
  path: '/gh/acme',
  repoCount: 3,
}

describe('organizations page', () => {
  beforeEach(() => installFakeEventSource())
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('lists organizations and adds one', async () => {
    const calls = mockApi({
      'GET /api/orgs': [200, [ACME]],
      'POST /api/orgs': [201, {created: true}],
    })
    renderWithToasts(<OrganizationsPage />)

    const name = await screen.findByText('acme', {selector: 'strong'})
    expect(name.closest('tr')?.textContent).toContain('dev@acme.test')
    expect(screen.getByText('3')).toBeTruthy()

    fireEvent.click(screen.getByText('Add organization'))
    fireEvent.change(screen.getByLabelText(/Name/), {target: {value: 'beta'}})
    fireEvent.change(screen.getByLabelText('Git email'), {target: {value: 'b@beta.test'}})
    fireEvent.change(screen.getByLabelText('Git username'), {target: {value: 'b'}})
    fireEvent.click(screen.getByText('Add'))

    await waitFor(() => expect(calls.some((c) => c.route === 'POST /api/orgs')).toBe(true))
    expect(calls.find((c) => c.route === 'POST /api/orgs')?.body).toEqual({
      gitEmail: 'b@beta.test',
      gitUsername: 'b',
      name: 'beta',
    })
  })

  it('makes deleting repositories a typed confirmation and sends it along', async () => {
    const calls = mockApi({
      'DELETE /api/orgs/acme': [200, {deletedFolder: true}],
      'GET /api/orgs': [200, [ACME]],
    })
    renderWithToasts(<OrganizationsPage />)

    fireEvent.click(await screen.findByText('Remove'))
    fireEvent.click(screen.getByLabelText(/Also delete/))
    const confirm = screen.getByText('Remove and delete repos').closest('button') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(/to confirm/), {target: {value: 'acme'}})
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)

    await waitFor(() => expect(calls.some((c) => c.route === 'DELETE /api/orgs/acme')).toBe(true))
    expect(calls.find((c) => c.route === 'DELETE /api/orgs/acme')?.body).toEqual({confirm: 'acme', deleteRepos: true})
  })

  it('plans a clone for an unknown org and creates it on clone', async () => {
    const calls = mockApi({
      'GET /api/orgs': [200, [ACME]],
      'POST /api/clone/plan': [
        200,
        {
          githubRoot: '/gh',
          host: 'github.com',
          org: null,
          orgName: 'stranger',
          organizations: [ACME],
          repo: 'web',
          url: 'u',
        },
      ],
      'POST /api/jobs/clone': [202, {id: 'job-1', status: 'running'}],
    })
    renderWithToasts(<OrganizationsPage />)

    fireEvent.change(await screen.findByLabelText('Repository URL'), {
      target: {value: 'git@github.com:stranger/web.git'},
    })
    fireEvent.click(screen.getByText('Check'))
    expect(await screen.findByText(/is not a configured organization/)).toBeTruthy()
    expect(screen.getByText('/gh/stranger/web')).toBeTruthy()

    const clone = screen.getByText('Clone').closest('button') as HTMLButtonElement
    expect(clone.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Git email'), {target: {value: 's@x.test'}})
    fireEvent.change(screen.getByLabelText('Git username'), {target: {value: 's'}})
    fireEvent.click(clone)

    await waitFor(() => expect(calls.some((c) => c.route === 'POST /api/jobs/clone')).toBe(true))
    expect(calls.find((c) => c.route === 'POST /api/jobs/clone')?.body).toEqual({
      target: {gitEmail: 's@x.test', gitUsername: 's', kind: 'new-org'},
      url: 'u',
    })
  })

  it('lists an organisation by topic and clones the repositories left ticked', async () => {
    const calls = mockApi({
      'GET /api/orgs': [200, [ACME]],
      'POST /api/clone/org-plan': [
        200,
        {
          org: null,
          orgName: 'stranger',
          organizations: [ACME],
          owner: 'stranger',
          repos: [
            {local: false, name: 'design', repoPath: '/gh/stranger/design', topics: ['0field']},
            {local: true, name: 'kernel', repoPath: '/gh/stranger/kernel', topics: ['0field']},
            {local: false, name: 'site', repoPath: '/gh/stranger/site', topics: ['0field', 'web']},
          ],
        },
      ],
      'POST /api/jobs/clone-org': [202, {id: 'job-2', status: 'running'}],
    })
    renderWithToasts(<OrganizationsPage />)

    fireEvent.change(await screen.findByLabelText('Organization on GitHub'), {target: {value: 'stranger'}})
    fireEvent.change(screen.getByLabelText('Topics'), {target: {value: '0field, web'}})
    fireEvent.click(screen.getByText('List'))

    const kernel = (await screen.findByLabelText('kernel')) as HTMLInputElement
    expect(kernel.disabled).toBe(true)
    expect(screen.getByText('already cloned')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('site'))
    fireEvent.click(screen.getByText('Clone without an identity'))
    fireEvent.click(screen.getByText('Clone 1'))

    await waitFor(() => expect(calls.some((c) => c.route === 'POST /api/jobs/clone-org')).toBe(true))
    expect(calls.find((c) => c.route === 'POST /api/clone/org-plan')?.body).toEqual({
      includeArchived: false,
      includeForks: false,
      owner: 'stranger',
      topics: ['0field', 'web'],
    })
    expect(calls.find((c) => c.route === 'POST /api/jobs/clone-org')?.body).toEqual({
      includeArchived: false,
      includeForks: false,
      owner: 'stranger',
      repos: ['design'],
      target: {kind: 'none'},
      topics: ['0field', 'web'],
    })
  })
})
