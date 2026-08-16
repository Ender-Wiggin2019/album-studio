import { createContext } from 'react'
import type { StudioPlatform } from './studio-platform'

export const StudioPlatformContext = createContext<StudioPlatform | null>(null)
