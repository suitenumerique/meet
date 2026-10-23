import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ProcessorBenchPage from './processor-bench/ProcessorBenchPage'
import './processor-bench/bench.css'

// Deliberately bare: none of meet's providers, i18n, analytics or
// initialization run here, so they cannot skew the measurements.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProcessorBenchPage />
  </StrictMode>
)
