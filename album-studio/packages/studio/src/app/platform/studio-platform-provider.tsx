import type { ReactNode } from 'react'
import { StudioPlatformContext } from './studio-platform-context'
import type { StudioPlatform } from './studio-platform'

export function StudioPlatformProvider({
  platform,
  children
}: {
  platform: StudioPlatform
  children: ReactNode
}): React.JSX.Element {
  return (
    <StudioPlatformContext.Provider value={platform}>{children}</StudioPlatformContext.Provider>
  )
}
