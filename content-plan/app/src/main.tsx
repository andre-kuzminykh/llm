import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Montserrat локально, как в Neuronium: интерфейс не ходит за шрифтом в CDN
import '@fontsource-variable/montserrat/wght.css'
import { App } from './App'
import './styles/theme.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
