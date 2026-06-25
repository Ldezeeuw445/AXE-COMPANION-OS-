import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toaster'
import { BeginnerModeProvider } from '@/lib/beginnerMode'
import './index.css'
import './styles/kimi-trading-ui.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <BeginnerModeProvider>
        <App />
        <Toaster />
      </BeginnerModeProvider>
    </TooltipProvider>
  </StrictMode>,
)
