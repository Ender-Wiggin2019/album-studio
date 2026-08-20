import { resolve } from 'node:path'

const desktopRoot = resolve(__dirname, '..')

export function packagedExecutableForCurrentPlatform(): string | null {
  if (process.env.ALBUM_STUDIO_PACKAGED_EXECUTABLE) {
    return resolve(process.env.ALBUM_STUDIO_PACKAGED_EXECUTABLE)
  }
  if (process.platform === 'win32') {
    return resolve(desktopRoot, 'dist', 'win-unpacked', 'kabo.exe')
  }
  if (process.platform === 'darwin') {
    const outputDirectory = process.arch === 'arm64' ? 'mac-arm64' : 'mac'
    return resolve(desktopRoot, 'dist', outputDirectory, '咔宝.app', 'Contents', 'MacOS', '咔宝')
  }
  return null
}
