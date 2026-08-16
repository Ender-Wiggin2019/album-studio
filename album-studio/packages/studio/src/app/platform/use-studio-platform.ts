import { useContext, useMemo } from 'react'
import { StudioPlatformContext } from './studio-platform-context'
import type { StudioCapability, StudioPlatform } from './studio-platform'

export function useStudioPlatform(): StudioPlatform {
  const platform = useContext(StudioPlatformContext)
  if (!platform) throw new Error('StudioPlatformProvider is missing')
  return platform
}

export function useStudioCapability(capability: StudioCapability): boolean {
  const platform = useStudioPlatform()
  return useMemo(() => platform.capabilities.has(capability), [capability, platform.capabilities])
}
