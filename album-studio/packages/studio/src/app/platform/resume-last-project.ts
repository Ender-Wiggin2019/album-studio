import type { AlbumDocument } from '@album-studio/common'
import type { StudioPlatform } from './studio-platform'

/**
 * 启动时自动继续打开最近一次编辑过的相册：
 * 取「最近项目」列表中第一个仍然存在的项目（最近更新优先，跳过已移动的）。
 * 没有可用相册时返回 null，由调用方回到项目首页。
 */
export async function resumeLastProject(
  projects: Pick<StudioPlatform['projects'], 'listRecent' | 'open'>
): Promise<AlbumDocument | null> {
  const recent = await projects.listRecent()
  const last = recent.find((item) => !item.missing)
  if (!last) return null
  return projects.open(last.id)
}
