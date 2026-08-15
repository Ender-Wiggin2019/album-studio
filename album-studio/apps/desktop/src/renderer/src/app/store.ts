import {
  createContentPage,
  createPhotoSlot,
  getLayoutTemplate,
  paginateAssetIds,
  type AlbumProject,
  type ContentPage,
  type MaskId,
  type OpenProjectResult,
  type PhotoSlot,
  type PhotoPresentation,
  type ThemeId
} from '@album-studio/common'
import { create } from 'zustand'

export type WorkspaceMode = 'library' | 'layout' | 'preview' | 'photo-edit'
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

type ProjectHistory = {
  past: AlbumProject[]
  future: AlbumProject[]
}

type StudioState = {
  projectPath: string | null
  project: AlbumProject | null
  mode: WorkspaceMode
  selectedPageId: string | null
  selectedSlotId: string | null
  selectedAssetIds: string[]
  missingAssetIds: string[]
  history: ProjectHistory
  saveState: SaveState
  saveError: string | null
  savedRevision: number
  openProject: (result: OpenProjectResult) => void
  closeProject: () => void
  setMode: (mode: WorkspaceMode) => void
  selectPage: (pageId: string) => void
  selectSlot: (pageId: string, slotId: string) => void
  toggleAsset: (assetId: string) => void
  setAssetSelection: (assetIds: string[]) => void
  clearAssetSelection: () => void
  selectAllAssets: () => void
  markAssetMissing: (assetId: string) => void
  markAssetAvailable: (assetId: string) => void
  mutateProject: (recipe: (draft: AlbumProject) => void) => void
  markSaving: () => void
  markSaved: (revision: number) => void
  markSaveError: (message: string) => void
  retrySave: () => void
  undo: () => void
  redo: () => void
  setTheme: (themeId: ThemeId) => void
  addSelectedAssetsToAlbum: (destination?: 'auto' | 'current' | 'new') => void
  addBlankPage: () => void
  removePage: (pageId: string) => void
  reorderPage: (pageId: string, direction: -1 | 1) => void
  changePageLayout: (pageId: string, count: number) => void
  movePhotoWithinPage: (pageId: string, slotId: string, direction: -1 | 1) => void
  movePhotoToPage: (pageId: string, slotId: string, direction: -1 | 1) => void
  removeSlotPhoto: (pageId: string, slotId: string) => void
  updatePhoto: (
    pageId: string,
    slotId: string,
    input: {
      media?: Partial<PhotoPresentation>
      maskId?: MaskId
      filters?: Partial<{ brightness: number; contrast: number; saturation: number }>
    }
  ) => void
}

function bump(project: AlbumProject): AlbumProject {
  return {
    ...project,
    revision: project.revision + 1,
    updatedAt: new Date().toISOString()
  }
}

function restoreSnapshot(snapshot: AlbumProject, currentRevision: number): AlbumProject {
  return {
    ...structuredClone(snapshot),
    revision: currentRevision + 1,
    updatedAt: new Date().toISOString()
  }
}

function currentContentPage(
  project: AlbumProject | null,
  pageId: string | null
): ContentPage | null {
  const page = project?.pages.find((candidate) => candidate.id === pageId)
  return page?.kind === 'content' ? page : null
}

function swapPhotoPlacement(left: PhotoSlot, right: PhotoSlot): void {
  const leftPlacement = {
    assetId: left.assetId,
    media: left.media,
    filters: left.filters,
    maskId: left.maskId,
    caption: left.caption
  }
  left.assetId = right.assetId
  left.media = right.media
  left.filters = right.filters
  left.maskId = right.maskId
  left.caption = right.caption
  right.assetId = leftPlacement.assetId
  right.media = leftPlacement.media
  right.filters = leftPlacement.filters
  right.maskId = leftPlacement.maskId
  right.caption = leftPlacement.caption
}

export const useStudioStore = create<StudioState>((set, get) => {
  const mutateProject: StudioState['mutateProject'] = (recipe) => {
    const current = get().project
    if (!current) return
    const next = structuredClone(current)
    recipe(next)
    set((state) => ({
      project: bump(next),
      history: { past: [...state.history.past.slice(-49), current], future: [] },
      saveState: 'dirty',
      saveError: null
    }))
  }

  return {
    projectPath: null,
    project: null,
    mode: 'layout',
    selectedPageId: null,
    selectedSlotId: null,
    selectedAssetIds: [],
    missingAssetIds: [],
    history: { past: [], future: [] },
    saveState: 'idle',
    saveError: null,
    savedRevision: 0,
    openProject: ({ projectPath, project }) =>
      set({
        projectPath,
        project,
        mode: 'layout',
        selectedPageId: project.pages[0]?.id ?? null,
        selectedSlotId: null,
        selectedAssetIds: [],
        missingAssetIds: [],
        history: { past: [], future: [] },
        saveState: 'saved',
        saveError: null,
        savedRevision: project.revision
      }),
    closeProject: () =>
      set({
        projectPath: null,
        project: null,
        mode: 'layout',
        selectedPageId: null,
        selectedSlotId: null,
        selectedAssetIds: [],
        missingAssetIds: [],
        history: { past: [], future: [] },
        saveState: 'idle',
        saveError: null,
        savedRevision: 0
      }),
    setMode: (mode) =>
      set({
        mode,
        selectedSlotId: mode === 'layout' || mode === 'photo-edit' ? get().selectedSlotId : null
      }),
    selectPage: (selectedPageId) => set({ selectedPageId, selectedSlotId: null, mode: 'layout' }),
    selectSlot: (selectedPageId, selectedSlotId) => set({ selectedPageId, selectedSlotId }),
    toggleAsset: (assetId) =>
      set((state) => ({
        selectedAssetIds: state.selectedAssetIds.includes(assetId)
          ? state.selectedAssetIds.filter((id) => id !== assetId)
          : [...state.selectedAssetIds, assetId]
      })),
    setAssetSelection: (selectedAssetIds) => set({ selectedAssetIds }),
    clearAssetSelection: () => set({ selectedAssetIds: [] }),
    selectAllAssets: () =>
      set((state) => ({ selectedAssetIds: state.project?.assets.map((asset) => asset.id) ?? [] })),
    markAssetMissing: (assetId) =>
      set((state) => ({
        missingAssetIds: state.missingAssetIds.includes(assetId)
          ? state.missingAssetIds
          : [...state.missingAssetIds, assetId]
      })),
    markAssetAvailable: (assetId) =>
      set((state) => ({
        missingAssetIds: state.missingAssetIds.filter((candidate) => candidate !== assetId)
      })),
    mutateProject,
    markSaving: () => set({ saveState: 'saving', saveError: null }),
    markSaved: (savedRevision) => set({ saveState: 'saved', savedRevision, saveError: null }),
    markSaveError: (saveError) => set({ saveState: 'error', saveError }),
    retrySave: () => set({ saveState: get().project ? 'dirty' : 'idle', saveError: null }),
    undo: () => {
      const state = get()
      const previous = state.history.past.at(-1)
      if (!state.project || !previous) return
      set({
        project: restoreSnapshot(previous, state.project.revision),
        history: {
          past: state.history.past.slice(0, -1),
          future: [state.project, ...state.history.future].slice(0, 50)
        },
        saveState: 'dirty',
        saveError: null
      })
    },
    redo: () => {
      const state = get()
      const next = state.history.future[0]
      if (!state.project || !next) return
      set({
        project: restoreSnapshot(next, state.project.revision),
        history: {
          past: [...state.history.past.slice(-49), state.project],
          future: state.history.future.slice(1)
        },
        saveState: 'dirty',
        saveError: null
      })
    },
    setTheme: (themeId) => mutateProject((project) => void (project.themeId = themeId)),
    addSelectedAssetsToAlbum: (destination = 'auto') => {
      const { project, selectedAssetIds, selectedPageId } = get()
      if (!project || selectedAssetIds.length === 0) return
      let firstTargetPageId: string | null = null
      let placedCount = 0
      mutateProject((draft) => {
        const remaining = [...selectedAssetIds]
        const currentPage = currentContentPage(draft, selectedPageId)
        if ((destination === 'auto' || destination === 'current') && currentPage) {
          for (const slot of currentPage.slots) {
            if (slot.assetId || remaining.length === 0) continue
            slot.assetId = remaining.shift() ?? null
            placedCount += 1
            firstTargetPageId ??= currentPage.id
          }
        }
        if (destination !== 'current' && remaining.length) {
          const pages = paginateAssetIds(remaining, draft.defaultPhotosPerPage)
          draft.pages.push(...pages)
          placedCount += remaining.length
          firstTargetPageId ??= pages[0]?.id ?? null
        }
        const cover = draft.pages[0]
        if (cover.kind === 'cover' && !cover.heroAssetId) cover.heroAssetId = selectedAssetIds[0]
      })
      set({
        selectedAssetIds: destination === 'current' ? selectedAssetIds.slice(placedCount) : [],
        mode: 'layout',
        selectedPageId: firstTargetPageId ?? get().selectedPageId,
        selectedSlotId: null
      })
    },
    addBlankPage: () => {
      mutateProject((project) => project.pages.push(createContentPage([null])))
      const page = get().project?.pages.at(-1)
      set({ selectedPageId: page?.id ?? null, selectedSlotId: null, mode: 'layout' })
    },
    removePage: (pageId) => {
      const state = get()
      const index = state.project?.pages.findIndex((page) => page.id === pageId) ?? -1
      if (index <= 0) return
      mutateProject((project) => {
        project.pages = project.pages.filter((page) => page.id !== pageId)
      })
      const pages = get().project?.pages ?? []
      set({
        selectedPageId: pages[Math.max(0, index - 1)]?.id ?? pages[0]?.id ?? null,
        selectedSlotId: null
      })
    },
    reorderPage: (pageId, direction) => {
      const state = get()
      const index = state.project?.pages.findIndex((page) => page.id === pageId) ?? -1
      const target = index + direction
      if (index <= 0 || target <= 0 || target >= (state.project?.pages.length ?? 0)) return
      mutateProject((project) => {
        const [page] = project.pages.splice(index, 1)
        project.pages.splice(target, 0, page)
      })
    },
    changePageLayout: (pageId, count) => {
      const normalized = Math.min(6, Math.max(1, Math.round(count)))
      const currentPage = currentContentPage(get().project, pageId)
      if (!currentPage || currentPage.slots.filter((slot) => slot.assetId).length > normalized)
        return
      mutateProject((project) => {
        const page = currentContentPage(project, pageId)
        if (!page) return
        const template = getLayoutTemplate(normalized)
        const placements = [
          ...page.slots.filter((slot) => slot.assetId),
          ...page.slots.filter((slot) => !slot.assetId)
        ]
        page.layoutId = template.id
        page.slots = template.frames.map((frame, index) => {
          const previous = placements[index]
          return previous ? { ...previous, frame } : createPhotoSlot(null, frame)
        })
      })
    },
    movePhotoWithinPage: (pageId, slotId, direction) => {
      const page = currentContentPage(get().project, pageId)
      const index = page?.slots.findIndex((slot) => slot.id === slotId) ?? -1
      const targetIndex = index + direction
      if (!page || index < 0 || targetIndex < 0 || targetIndex >= page.slots.length) return
      const targetSlotId = page.slots[targetIndex].id
      mutateProject((project) => {
        const targetPage = currentContentPage(project, pageId)
        if (!targetPage) return
        swapPhotoPlacement(targetPage.slots[index], targetPage.slots[targetIndex])
      })
      set({ selectedSlotId: targetSlotId })
    },
    movePhotoToPage: (pageId, slotId, direction) => {
      const project = get().project
      const sourcePageIndex = project?.pages.findIndex((page) => page.id === pageId) ?? -1
      const targetPage = project?.pages[sourcePageIndex + direction]
      const sourcePage = currentContentPage(project, pageId)
      const sourceSlot = sourcePage?.slots.find((slot) => slot.id === slotId)
      if (!sourceSlot?.assetId || targetPage?.kind !== 'content') return
      const targetSlot =
        targetPage.slots.find((slot) => !slot.assetId) ??
        targetPage.slots[direction === 1 ? 0 : targetPage.slots.length - 1]
      if (!targetSlot) return
      mutateProject((draft) => {
        const draftSource = currentContentPage(draft, pageId)?.slots.find(
          (slot) => slot.id === slotId
        )
        const draftTargetPage = currentContentPage(draft, targetPage.id)
        const draftTarget = draftTargetPage?.slots.find((slot) => slot.id === targetSlot.id)
        if (draftSource && draftTarget) swapPhotoPlacement(draftSource, draftTarget)
      })
      set({ selectedPageId: targetPage.id, selectedSlotId: targetSlot.id })
    },
    removeSlotPhoto: (pageId, slotId) =>
      mutateProject((project) => {
        const page = currentContentPage(project, pageId)
        const slot = page?.slots.find((candidate) => candidate.id === slotId)
        if (slot) slot.assetId = null
      }),
    updatePhoto: (pageId, slotId, input) =>
      mutateProject((project) => {
        const page = currentContentPage(project, pageId)
        const slot = page?.slots.find((candidate) => candidate.id === slotId)
        if (!slot) return
        if (input.media) {
          slot.media = {
            ...slot.media,
            ...input.media,
            crop: { ...slot.media.crop, ...(input.media.crop ?? {}) }
          }
        }
        if (input.filters) slot.filters = { ...slot.filters, ...input.filters }
        if (input.maskId) slot.maskId = input.maskId
      })
  }
})
