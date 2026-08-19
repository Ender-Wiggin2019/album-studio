import { resolve } from 'node:path'

const desktopRoot = resolve(__dirname, '..')

export function packagedExecutableForCurrentPlatform(): string | null {
  if (process.env.ALBUM_STUDIO_PACKAGED_EXECUTABLE) {
    return resolve(process.env.ALBUM_STUDIO_PACKAGED_EXECUTABLE)
  }
  if (process.platform === 'win32') {
    return resolve(desktopRoot, 'dist', 'win-unpacked', 'album-studio.exe')
  }
  if (process.platform === 'darwin') {
    const outputDirectory = process.arch === 'arm64' ? 'mac-arm64' : 'mac'
    return resolve(
      desktopRoot,
      'dist',
      outputDirectory,
      '电子相册工作室.app',
      'Contents',
      'MacOS',
      '电子相册工作室'
    )
  }
  return null
}
