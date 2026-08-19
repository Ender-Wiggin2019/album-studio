import type { AlbumDocument } from '@album-studio/common'
import type { StudioPlatform } from './studio-platform'

type ProjectReader = Pick<StudioPlatform['projects'], 'listRecent' | 'open'>

const resumeInFlight = new WeakMap<ProjectReader, Promise<AlbumDocument | null>>()

async function resumeAvailableProject(projects: ProjectReader): Promise<AlbumDocument | null> {
  const recent = await projects.listRecent()
  for (const item of recent) {
    if (item.missing) continue
    try {
      return await projects.open(item.id)
    } catch {
      // 最近项目可能已移动、损坏或暂时无法读取，继续尝试下一个。
    }
  }
  return null
}

/**
 * 启动时自动继续打开最近一次编辑过的相册：
 * 按「最近项目」顺序依次尝试仍然存在的项目，单个项目打开失败不会阻断回退。
 * 同一平台适配器的并发恢复共享一个在途请求，避免 React StrictMode 重入重复读取。
 * 没有可用相册时返回 null，由调用方回到项目首页。
 */
export function resumeLastProject(projects: ProjectReader): Promise<AlbumDocument | null> {
  const current = resumeInFlight.get(projects)
  if (current) return current

  const resume = resumeAvailableProject(projects)
  resumeInFlight.set(projects, resume)
  void resume.then(
    () => {
      if (resumeInFlight.get(projects) === resume) resumeInFlight.delete(projects)
    },
    () => {
      if (resumeInFlight.get(projects) === resume) resumeInFlight.delete(projects)
    }
  )
  return resume
}
