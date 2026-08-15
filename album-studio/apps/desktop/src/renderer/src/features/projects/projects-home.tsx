import type { LegacyInspection, RecentProject, ThemeId } from '@album-studio/common'
import {
  AlertCircleIcon,
  BookOpenIcon,
  FolderOpenIcon,
  ImagesIcon,
  ImportIcon,
  PlusIcon
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ThemePreviewCard } from './theme-preview-card'

export function ProjectsHome({
  onOpen
}: {
  onOpen: (result: Awaited<ReturnType<typeof window.albumStudio.projects.openPath>>) => void
}): React.JSX.Element {
  const [recent, setRecent] = useState<RecentProject[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('我的新相册')
  const [themeId, setThemeId] = useState<ThemeId>('journal')
  const [inspection, setInspection] = useState<LegacyInspection | null>(null)

  useEffect(() => {
    let active = true
    window.albumStudio.projects
      .listRecent()
      .then((items) => active && setRecent(items))
      .catch(
        (reason) =>
          active && setError(reason instanceof Error ? reason.message : '无法读取最近项目')
      )
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const run = async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await operation()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败')
    } finally {
      setBusy(false)
    }
  }

  const createProject = (): void => {
    void run(async () => {
      const result = await window.albumStudio.projects.create({ title: title.trim(), themeId })
      if (result) {
        setCreateOpen(false)
        onOpen(result)
      }
    })
  }

  const openProject = (): void => {
    void run(async () => {
      const result = await window.albumStudio.projects.chooseAndOpen()
      if (result) onOpen(result)
    })
  }

  const inspectLegacy = (): void => {
    void run(async () => {
      const result = await window.albumStudio.legacy.chooseAndInspect()
      if (result) setInspection(result)
    })
  }

  const commitLegacy = (): void => {
    if (!inspection) return
    void run(async () => {
      const result = await window.albumStudio.legacy.commit({
        inspectionId: inspection.inspectionId,
        themeFallback: 'journal'
      })
      if (result) {
        setInspection(null)
        onOpen(result)
      }
    })
  }

  return (
    <main className="app-shell h-dvh overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-7 py-8 lg:px-12 lg:py-12">
        <header className="flex items-center justify-between gap-4 border-b pb-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-foreground text-background">
              <ImagesIcon className="size-5" />
            </span>
            <div>
              <p className="text-base font-semibold">电子相册工作室</p>
              <p className="text-xs text-muted-foreground">本地整理 · 安心成册</p>
            </div>
          </div>
          <Badge variant="outline">Windows / macOS</Badge>
        </header>

        <section className="grid items-end gap-8 py-12 md:grid-cols-[1fr_auto]">
          <div className="max-w-2xl">
            <p className="mb-3 font-mono text-xs tracking-[0.18em] text-primary">
              本地照片 · 安心成册
            </p>
            <h1 className="text-balance text-4xl font-semibold tracking-[-0.035em] md:text-5xl">
              把散落的照片，整理成一本真正的相册。
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              照片保留在你的电脑上。选择素材、完成排版，然后导出带封面的 A4 横向 PDF。
            </p>
          </div>
          <Button size="lg" onClick={() => setCreateOpen(true)} disabled={busy}>
            <PlusIcon data-icon="inline-start" />
            新建相册
          </Button>
        </section>

        {error ? (
          <div
            role="alert"
            className="mb-6 flex items-start gap-2 rounded-lg border border-destructive/35 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        ) : null}

        <section aria-labelledby="quick-start-title" className="grid gap-3 md:grid-cols-2">
          <h2 id="quick-start-title" className="sr-only">
            开始使用
          </h2>
          <button
            type="button"
            onClick={openProject}
            disabled={busy}
            className="group flex items-center gap-4 rounded-xl border bg-card p-5 text-left shadow-xs outline-none transition-colors hover:border-primary/45 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
              <FolderOpenIcon className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">打开相册</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                继续编辑已有的 .album-project 文件夹
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={inspectLegacy}
            disabled={busy}
            className="group flex items-center gap-4 rounded-xl border bg-card p-5 text-left shadow-xs outline-none transition-colors hover:border-primary/45 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
              <ImportIcon className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">导入旧相册</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                迁移旧 JSON 或自包含 HTML，不覆盖源文件
              </span>
            </span>
          </button>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">最近项目</h2>
            {recent.length ? (
              <span className="text-xs text-muted-foreground">最多保留 12 个</span>
            ) : null}
          </div>
          {loading ? (
            <div className="grid gap-3 md:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="rounded-xl border p-4">
                  <Skeleton className="aspect-[4/3] w-full" />
                  <Skeleton className="mt-4 h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : recent.length ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {recent.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (item.missing) {
                      openProject()
                      return
                    }
                    void run(async () =>
                      onOpen(await window.albumStudio.projects.openPath(item.path))
                    )
                  }}
                  className="group grid gap-4 rounded-xl border bg-card p-4 text-left shadow-xs outline-none transition-colors hover:border-primary/45 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-65"
                >
                  <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
                    <div
                      className="absolute inset-5 border bg-background shadow-sm"
                      data-album-theme={item.themeId}
                    >
                      <div className="size-full border-l-4 border-primary/60 p-3">
                        <BookOpenIcon className="size-5 text-muted-foreground" />
                      </div>
                    </div>
                    {item.missing ? (
                      <Badge variant="destructive" className="absolute right-2 top-2">
                        文件夹已移动
                      </Badge>
                    ) : null}
                  </div>
                  <span>
                    <span className="block truncate font-semibold">{item.title}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {item.missing
                        ? '点击重新定位项目文件夹'
                        : new Date(item.updatedAt).toLocaleString('zh-CN')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid min-h-52 place-items-center rounded-xl border border-dashed bg-muted/25 px-6 text-center">
              <div>
                <BookOpenIcon className="mx-auto mb-3 size-7 text-muted-foreground" />
                <p className="font-medium">还没有相册</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  新建一本相册，或打开已经保存的项目。
                </p>
                <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                  <PlusIcon data-icon="inline-start" />
                  新建相册
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建相册</DialogTitle>
            <DialogDescription>
              先为项目命名并选择一个成品主题。主题以后仍可修改。
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="project-title">相册名称</FieldLabel>
                <Input
                  id="project-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  autoFocus
                  maxLength={160}
                />
                <FieldDescription>创建时会让你选择项目保存位置。</FieldDescription>
                {!title.trim() ? <FieldError>请输入相册名称。</FieldError> : null}
              </Field>
              <Field>
                <FieldLabel>相册主题</FieldLabel>
                <div role="radiogroup" className="grid gap-3 sm:grid-cols-3">
                  {(['journal', 'postcard', 'film'] as const).map((theme) => (
                    <ThemePreviewCard
                      key={theme}
                      themeId={theme}
                      selected={themeId === theme}
                      onSelect={() => setThemeId(theme)}
                    />
                  ))}
                </div>
              </Field>
            </FieldGroup>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={createProject} disabled={busy || !title.trim()}>
              {busy ? '正在创建…' : '创建相册'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(inspection)} onOpenChange={(open) => !open && setInspection(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>旧相册迁移预览</DialogTitle>
            <DialogDescription>迁移会创建一个全新的项目，源文件保持不变。</DialogDescription>
          </DialogHeader>
          <DialogBody>
            {inspection ? (
              <div className="grid gap-5">
                <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted p-4 text-center">
                  <div>
                    <strong className="block text-xl">{inspection.placementCount}</strong>
                    <span className="text-xs text-muted-foreground">照片位置</span>
                  </div>
                  <div>
                    <strong className="block text-xl">{inspection.estimatedPageCount}</strong>
                    <span className="text-xs text-muted-foreground">含封面页数</span>
                  </div>
                  <div>
                    <strong className="block text-xl">v{inspection.schemaVersion}</strong>
                    <span className="text-xs text-muted-foreground">旧数据版本</span>
                  </div>
                </div>
                <div>
                  <p className="font-medium">{inspection.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{inspection.sourceName}</p>
                </div>
                {inspection.issues.length ? (
                  <ul className="grid gap-2">
                    {inspection.issues.map((issue, index) => (
                      <li key={`${issue.code}-${index}`} className="rounded-md border p-3 text-sm">
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    检查完成，没有需要确认的兼容提示。
                  </p>
                )}
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInspection(null)}>
              取消
            </Button>
            <Button onClick={commitLegacy} disabled={busy}>
              {busy ? '正在迁移…' : '导入为新项目'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
