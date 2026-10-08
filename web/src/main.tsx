import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'

import {App} from './app.js'
import {ToastProvider} from './toast.js'
import './styles.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
