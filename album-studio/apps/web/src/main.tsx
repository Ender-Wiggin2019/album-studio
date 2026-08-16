import '@/styles/index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StudioApp, StudioPlatformProvider } from '@album-studio/studio'
import { createBrowserPlatform } from './platform/browser-platform'

const platform = createBrowserPlatform()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StudioPlatformProvider platform={platform}>
      <StudioApp />
    </StudioPlatformProvider>
  </StrictMode>
)
