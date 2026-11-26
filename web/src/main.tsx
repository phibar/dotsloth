import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'

import {App} from './app.js'
import {ToastProvider} from './toast.js'
import './styles.css'

/**
 * Purpose: the web UI starts in the browser.
 *
 * Intention: mounts App inside the toast provider.
 */

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
