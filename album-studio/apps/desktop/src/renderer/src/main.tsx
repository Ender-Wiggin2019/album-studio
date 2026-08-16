import '@/styles/index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StudioApp, StudioPlatformProvider } from '@album-studio/studio'
import { createDesktopPlatform } from './platform/desktop-platform'

const platform = createDesktopPlatform()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StudioPlatformProvider platform={platform}>
      <StudioApp />
    </StudioPlatformProvider>
  </StrictMode>
)
