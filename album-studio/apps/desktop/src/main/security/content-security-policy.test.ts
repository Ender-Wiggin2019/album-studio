import { describe, expect, it } from 'vitest'
import { buildContentSecurityPolicy } from './content-security-policy'

describe('buildContentSecurityPolicy', () => {
  it('adds the inline-script allowance required by Vite React Refresh only in development', () => {
    const policy = buildContentSecurityPolicy({ development: true })

    expect(policy).toContain("script-src 'self' 'unsafe-inline'")
    expect(policy).toContain("connect-src 'self' album-asset: ws: http: https:")
  })

  it('keeps scripts and network connections strict in production', () => {
    const policy = buildContentSecurityPolicy({ development: false })

    expect(policy).toContain("script-src 'self'")
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(policy).toContain("connect-src 'self' album-asset:")
    expect(policy).not.toContain(' ws:')
    expect(policy).not.toContain(' http:')
    expect(policy).not.toContain(' https:')
    expect(policy).toContain("img-src 'self' album-asset: album-candidate: data: blob:")
  })
})
