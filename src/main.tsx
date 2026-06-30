import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { initTelemetry } from './utils/telemetry'

// Catch-all client error reporting (uncaught errors + unhandled rejections) so
// we don't hand-write a clientLog in every component.
initTelemetry()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary context="app">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
