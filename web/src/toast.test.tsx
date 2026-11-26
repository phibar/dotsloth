import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import {afterEach, describe, expect, it} from 'vitest'

import {ApiError} from './api.js'
import {ToastProvider, useToast} from './toast.js'

/**
 * Purpose: an API error reaches the person as a toast with its details.
 *
 * Intention: renders the toast provider in jsdom.
 */
describe('toasts', () => {
  afterEach(() => cleanup())

  it('shows an API error with its details', () => {
    function Trigger() {
      const toast = useToast()
      return (
        <button
          onClick={() => toast.error(new ApiError(400, {details: ['name: required'], message: 'Invalid'}))}
          type="button"
        >
          fail
        </button>
      )
    }

    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('fail'))

    expect(screen.getByRole('alert').textContent).toContain('Invalid')
    expect(screen.getByRole('alert').textContent).toContain('name: required')
  })
})
