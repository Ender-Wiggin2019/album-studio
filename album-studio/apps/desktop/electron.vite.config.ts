import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { normalizePath } from 'vite'
import { buildContentSecurityPolicy } from './src/main/security/content-security-policy'

const hmrProbeUrl = encodeURI(
  `/@fs/${normalizePath(resolve(import.meta.dirname, 'scripts/fixtures/dev-hmr-probe.css'))}`
)

const contentSecurityPolicyPlugin = {
  name: 'album-studio-content-security-policy',
  transformIndexHtml(html: string, context: { server?: unknown }): string {
    const securedHtml = html.replace(
      '__ALBUM_STUDIO_CONTENT_SECURITY_POLICY__',
      buildContentSecurityPolicy({ development: context.server !== undefined })
    )
    if (context.server === undefined) return securedHtml
    return securedHtml.replace(
      '</head>',
      `    <link data-album-studio-hmr-probe rel="stylesheet" href="${hmrProbeUrl}" />\n  </head>`
    )
  }
}

export default defineConfig({
  main: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        external: ['sharp']
      }
    }
  },
  preload: {
    build: {
      externalizeDeps: false
    }
  },
  renderer: {
    build: {
      minify: 'esbuild'
    },
    resolve: {
      alias: {
        '@': resolve('../../packages/studio/src'),
        '@album-studio/common': resolve('../../packages/common/src/index.ts'),
        '@album-studio/studio': resolve('../../packages/studio/src/index.ts'),
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [contentSecurityPolicyPlugin, react(), tailwindcss()]
  }
})
