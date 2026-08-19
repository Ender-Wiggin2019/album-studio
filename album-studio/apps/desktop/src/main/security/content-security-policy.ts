export interface ContentSecurityPolicyOptions {
  development: boolean
}

export function buildContentSecurityPolicy({ development }: ContentSecurityPolicyOptions): string {
  const scriptSource = development ? "'self' 'unsafe-inline'" : "'self'"
  const connectSource = development ? "'self' album-asset: ws: http: https:" : "'self' album-asset:"

  return [
    "default-src 'self'",
    `script-src ${scriptSource}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' album-asset: album-candidate: data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSource}`,
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')
}
