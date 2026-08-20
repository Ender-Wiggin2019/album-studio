import {
  DEFAULT_PAGE_SPEC,
  PAGE_SPEC_PRESETS,
  type PageSpec,
  type ThemeId
} from '@album-studio/common'
import {
  AlertCircleIcon,
  BookOpenIcon,
  FolderOpenIcon,
  HardDriveIcon,
  ImagesIcon,
  PlusIcon
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useStudioPlatform } from '@/app/platform/use-studio-platform'
import type { RecentStudioProject } from '@/app/platform/studio-platform'
import { useStudioStore } from '@/app/store'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ThemePreviewCard } from '@/features/theme/theme-preview-card'
import { BRAND_NAME, BRAND_SLOGAN, BrandMark } from '@/shared/brand/brand-mark'

const pageSpecLabels: Record<PageSpec['presetId'], { name: string; size: string }> = {
  'a4-landscape': { name: 'A4 横向', size: '297 × 210 mm' },
  'a4-portrait': { name: 'A4 竖排', size: '210 × 297 mm' },
  'square-12': { name: '12 寸方形', size: '304.8 × 304.8 mm' },
  'widescreen-16-9': { name: '16:9 宽屏', size: '338.67 × 190.5 mm' }
}

export function ProjectsHome(): React.JSX.Element {
  const platform = useStudioPlatform()
  const openDocument = useStudioStore((state) => state.openDocument)
  const [recent, setRecent] = useState<RecentStudioProject[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('我的新相册')
  const [themeId, setThemeId] = useState<ThemeId>('journal')
  const [pageSpec, setPageSpec] = useState<PageSpec>({ ...DEFAULT_PAGE_SPEC })
  const hasNativeFolders = platform.capabilities.has('durable-project-folder')

  useEffect(() => {
    let active = true
    void platform.projects
      .listRecent()
      .then((items) => {
        if (active) setRecent(items)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '无法读取最近项目')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [platform])

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
      const document = await platform.projects.create({ title: title.trim(), themeId, pageSpec })
      if (!document) return
      setCreateOpen(false)
      openDocument(document)
    })
  }

  const chooseProject = (): void => {
    void run(async () => {
      const document = await platform.projects.chooseAndOpen()
      if (document) openDocument(document)
    })
  }

  const openRecent = (project: RecentStudioProject): void => {
    void run(async () => {
      if (project.missing) {
        const document = await platform.projects.chooseAndOpen()
        if (document) openDocument(document)
        return
      }
      openDocument(await platform.projects.open(project.id))
    })
  }

  return (
    <main className="app-shell h-dvh overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-7 py-8 lg:px-12 lg:py-12">
        <header className="flex items-center justify-between gap-4 border-b pb-6">
          <div className="flex items-center gap-3">
            <BrandMark alt="" />
            <div>
              <p className="text-base font-semibold">{BRAND_NAME}</p>
              <p className="text-xs text-muted-foreground">自由排版 · 安心成册</p>
            </div>
          </div>
          <Badge variant="outline">
            {platform.kind === 'desktop' ? 'Windows / macOS' : '浏览器离线版'}
          </Badge>
        </header>

        <section className="grid items-end gap-8 py-12 md:grid-cols-[1fr_auto]">
          <div className="max-w-2xl">
            <p className="mb-3 font-mono text-xs tracking-[0.18em] text-primary">{BRAND_SLOGAN}</p>
            <h1 className="text-balance text-4xl font-semibold tracking-[-0.035em] md:text-5xl">
              把散落的照片，编排成一本真正的相册。
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              拖动、缩放、旋转、裁剪与美化都在一个画布完成；自动保存，随时预览整册。
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
          {hasNativeFolders ? (
            <button
              type="button"
              onClick={chooseProject}
              disabled={busy}
              className="group flex items-center gap-4 rounded-xl border bg-card p-5 text-left shadow-xs outline-none transition-colors hover:border-primary/45 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                <FolderOpenIcon className="size-5" />
              </span>
              <span>
                <span className="block font-semibold">打开相册文件夹</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  选择新版 .album-project 项目，不导入旧格式
                </span>
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-4 rounded-xl border bg-card p-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                <HardDriveIcon className="size-5" />
              </span>
              <span>
                <span className="block font-semibold">保存在此浏览器</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  刷新后仍可继续；清除浏览器站点数据会删除项目
                </span>
              </span>
            </div>
          )}
          <div className="flex items-center gap-4 rounded-xl border bg-card p-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
              <ImagesIcon className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">无需学习复杂工具</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                新建 → 导入照片 → 选模板或自由拖放 → 导出
              </span>
            </span>
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">最近项目</h2>
            {recent.length ? (
              <span className="text-xs text-muted-foreground">最近更新优先</span>
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
                  key={item.id}
                  type="button"
                  disabled={busy}
                  onClick={() => openRecent(item)}
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
                        ? '点击重新定位'
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
                  新建一本相册，从几张喜欢的照片开始。
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
            <DialogDescription>命名相册并选择成品尺寸与主题。</DialogDescription>
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
                <FieldDescription>
                  {hasNativeFolders
                    ? '创建时选择长期保存的项目文件夹。'
                    : '项目将保存到当前浏览器的离线存储。'}
                </FieldDescription>
                {!title.trim() ? <FieldError>请输入相册名称。</FieldError> : null}
              </Field>
              <Field>
                <FieldLabel id="page-spec-label">成品尺寸</FieldLabel>
                <ToggleGroup
                  type="single"
                  value={pageSpec.presetId}
                  aria-labelledby="page-spec-label"
                  className="grid w-full grid-cols-1 gap-2 border-0 bg-transparent p-0 sm:grid-cols-3"
                  onValueChange={(presetId) => {
                    const next = PAGE_SPEC_PRESETS.find((preset) => preset.presetId === presetId)
                    if (next) setPageSpec({ ...next })
                  }}
                >
                  {PAGE_SPEC_PRESETS.map((preset) => {
                    const label = pageSpecLabels[preset.presetId]
                    return (
                      <ToggleGroupItem
                        key={preset.presetId}
                        value={preset.presetId}
                        aria-label={`${label.name}，${label.size}`}
                        className="h-auto min-h-24 min-w-0 flex-col gap-2 border px-3 py-3 text-left data-[state=on]:border-primary data-[state=on]:bg-primary/8 data-[state=on]:text-foreground"
                      >
                        <span className="grid h-8 w-full place-items-center" aria-hidden="true">
                          <span
                            className="block max-h-8 max-w-14 border border-current bg-background shadow-xs"
                            style={{
                              aspectRatio: `${preset.widthMm} / ${preset.heightMm}`,
                              width:
                                preset.widthMm === preset.heightMm
                                  ? '2rem'
                                  : preset.presetId === 'widescreen-16-9'
                                    ? '3.5rem'
                                    : '3rem'
                            }}
                          />
                        </span>
                        <span className="grid w-full gap-0.5">
                          <span className="text-center text-xs font-semibold">{label.name}</span>
                          <span className="text-center text-[10px] text-muted-foreground">
                            {label.size}
                          </span>
                        </span>
                      </ToggleGroupItem>
                    )
                  })}
                </ToggleGroup>
                <FieldDescription>默认 A4 横向；项目创建后不可更改尺寸。</FieldDescription>
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
    </main>
  )
}
