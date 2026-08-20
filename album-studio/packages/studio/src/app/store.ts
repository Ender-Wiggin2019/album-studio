import {
  applyAlbumPatches,
  executeAlbumCommands,
  mergeRecentColors,
  type AlbumCommand,
  type AlbumDocument,
  type AlbumPatch,
  type RichTextDocument
} from '@album-studio/common'
import { create } from 'zustand'
import {
  createProjectSaveSession,
  type ProjectSaveState,
  type SaveDocument
} from './project-save-session'

export type ExclusiveWorkspace = 'preview' | 'image-edit' | 'erase-people' | null
export type PersistentPanelTab = 'layout' | 'assets' | 'components'
export type RightPanelTab = PersistentPanelTab | 'block'
export type SaveState = ProjectSaveState

export type RichTextDraft = Readonly<{
  pageId: string
  blockId: string
  document: RichTextDocument
  usedColors?: readonly string[]
}>

type HistoryEntry = {
  label: AlbumCommand['type']
  patches: readonly AlbumPatch[]
  inversePatches: readonly AlbumPatch[]
}

type DocumentHistory = {
  past: HistoryEntry[]
  future: HistoryEntry[]
}

export type StudioState = {
  document: AlbumDocument | null
  exclusiveWorkspace: ExclusiveWorkspace
  selectedPageId: string | null
  selectedBlockId: string | null
  rightPanelTab: RightPanelTab
  lastPersistentPanelTab: PersistentPanelTab
  rightPanelSheetOpen: boolean
  richTextDraft: RichTextDraft | null
  selectedAssetIds: string[]
  missingAssetIds: string[]
  history: DocumentHistory
  saveState: SaveState
  saveError: string | null
  savedRevision: number
  openDocument(document: AlbumDocument): void
  closeDocument(): void
  setExclusiveWorkspace(workspace: ExclusiveWorkspace): void
  setRightPanelTab(tab: RightPanelTab): void
  setRightPanelSheetOpen(open: boolean): void
  selectPage(pageId: string): void
  selectBlock(pageId: string, blockId: string): void
  clearBlockSelection(): void
  setRichTextDraft(
    pageId: string,
    blockId: string,
    document: RichTextDocument,
    usedColors?: readonly string[]
  ): void
  commitRichTextDraft(): void
  toggleAsset(assetId: string): void
  setAssetSelection(assetIds: string[]): void
  clearAssetSelection(): void
  selectAllAssets(): void
  markAssetMissing(assetId: string): void
  markAssetAvailable(assetId: string): void
  dispatch(command: AlbumCommand): void
  dispatchMany(commands: readonly AlbumCommand[]): void
  connectPersistence(saveDocument: SaveDocument): void
  flush(): Promise<void>
  retrySave(): void
  undo(): void
  redo(): void
}

function commandResult(
  document: AlbumDocument,
  commands: readonly AlbumCommand[]
): { document: AlbumDocument; history: HistoryEntry } {
  const result = executeAlbumCommands(document, commands)
  return {
    document: result.document,
    history: {
      label: commands.at(-1)?.type ?? 'set-project-title',
      patches: result.patches,
      inversePatches: result.inversePatches
    }
  }
}

function pageAfterDelete(document: AlbumDocument, deletedPageId: string): string | null {
  const deletedIndex = document.pages.findIndex((page) => page.id === deletedPageId)
  return document.pages[Math.max(0, deletedIndex - 1)]?.id ?? document.pages[0]?.id ?? null
}

function blockSelectionPatch(
  document: AlbumDocument,
  state: Pick<
    StudioState,
    'selectedBlockId' | 'lastPersistentPanelTab' | 'rightPanelTab' | 'rightPanelSheetOpen'
  >
): Partial<StudioState> {
  if (!state.selectedBlockId) return {}
  const owner = document.pages.find((page) =>
    page.blocks.some((block) => block.id === state.selectedBlockId)
  )
  if (owner) return { selectedPageId: owner.id }
  return {
    selectedBlockId: null,
    rightPanelTab: state.lastPersistentPanelTab,
    rightPanelSheetOpen: false
  }
}

const projectSaveSession = createProjectSaveSession({
  onStateChange: (snapshot) => {
    useStudioStore.setState({
      saveState: snapshot.state,
      saveError: snapshot.error,
      savedRevision: snapshot.savedRevision
    })
  }
})

const RICH_TEXT_COMMIT_DELAY_MS = 650

function richTextDocumentsEqual(left: RichTextDocument, right: RichTextDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export const useStudioStore = create<StudioState>((set, get) => {
  let richTextCommitTimer: ReturnType<typeof setTimeout> | null = null

  const clearRichTextCommitTimer = (): void => {
    if (richTextCommitTimer === null) return
    clearTimeout(richTextCommitTimer)
    richTextCommitTimer = null
  }

  const dispatchMany: StudioState['dispatchMany'] = (commands) => {
    if (commands.length === 0) return
    const currentState = get()
    const current = currentState.document
    if (!current) return
    const result = commandResult(current, commands)
    const last = commands.at(-1)
    const selectionPatch: Partial<StudioState> = {}
    if (last?.type === 'delete-block' && last.blockId === currentState.selectedBlockId) {
      selectionPatch.selectedBlockId = null
      selectionPatch.rightPanelTab = currentState.lastPersistentPanelTab
      selectionPatch.rightPanelSheetOpen = false
    }
    if (last?.type === 'delete-page') {
      selectionPatch.selectedPageId = pageAfterDelete(current, last.pageId)
      selectionPatch.selectedBlockId = null
      selectionPatch.rightPanelTab = currentState.lastPersistentPanelTab
      selectionPatch.rightPanelSheetOpen = false
    }
    Object.assign(
      selectionPatch,
      blockSelectionPatch(result.document, { ...currentState, ...selectionPatch })
    )
    set((state) => ({
      ...selectionPatch,
      document: result.document,
      history: {
        past: [...state.history.past.slice(-99), result.history],
        future: []
      }
    }))
    projectSaveSession.changed(result.document)
  }

  const commitRichTextDraft: StudioState['commitRichTextDraft'] = () => {
    clearRichTextCommitTimer()
    const { document, richTextDraft } = get()
    if (!document || !richTextDraft) return
    set({ richTextDraft: null })
    const page = document.pages.find((candidate) => candidate.id === richTextDraft.pageId)
    const block = page?.blocks.find((candidate) => candidate.id === richTextDraft.blockId)
    const usedColors = richTextDraft.usedColors ?? []
    const paletteChanged = usedColors.some(
      (color) => !document.recentColors.includes(color.toLowerCase())
    )
    if (
      !page ||
      !block ||
      block.type !== 'rich-text' ||
      (richTextDocumentsEqual(block.document, richTextDraft.document) && !paletteChanged)
    ) {
      return
    }
    dispatchMany([
      {
        type: 'update-rich-text',
        pageId: page.id,
        blockId: block.id,
        document: richTextDraft.document,
        usedColors: [...usedColors]
      }
    ])
  }

  const restorePersistentPanel = (): Pick<
    StudioState,
    'rightPanelTab' | 'rightPanelSheetOpen'
  > => ({
    rightPanelTab: get().lastPersistentPanelTab,
    rightPanelSheetOpen: false
  })

  return {
    document: null,
    exclusiveWorkspace: null,
    selectedPageId: null,
    selectedBlockId: null,
    rightPanelTab: 'layout',
    lastPersistentPanelTab: 'layout',
    rightPanelSheetOpen: false,
    richTextDraft: null,
    selectedAssetIds: [],
    missingAssetIds: [],
    history: { past: [], future: [] },
    saveState: 'idle',
    saveError: null,
    savedRevision: 0,
    openDocument: (document) => {
      clearRichTextCommitTimer()
      set({
        document,
        exclusiveWorkspace: null,
        selectedPageId: document.pages[0]?.id ?? null,
        selectedBlockId: null,
        rightPanelTab: 'layout',
        lastPersistentPanelTab: 'layout',
        rightPanelSheetOpen: false,
        richTextDraft: null,
        selectedAssetIds: [],
        missingAssetIds: [],
        history: { past: [], future: [] },
        saveState: 'saved',
        saveError: null,
        savedRevision: document.revision
      })
      projectSaveSession.open(document)
    },
    closeDocument: () => {
      clearRichTextCommitTimer()
      projectSaveSession.close()
      set({
        document: null,
        exclusiveWorkspace: null,
        selectedPageId: null,
        selectedBlockId: null,
        rightPanelTab: 'layout',
        lastPersistentPanelTab: 'layout',
        rightPanelSheetOpen: false,
        richTextDraft: null,
        selectedAssetIds: [],
        missingAssetIds: [],
        history: { past: [], future: [] },
        saveState: 'idle',
        saveError: null,
        savedRevision: 0
      })
    },
    setExclusiveWorkspace: (exclusiveWorkspace) => {
      commitRichTextDraft()
      set({
        exclusiveWorkspace,
        ...(exclusiveWorkspace ? { rightPanelSheetOpen: false } : {})
      })
    },
    setRightPanelTab: (rightPanelTab) => {
      const state = get()
      if (rightPanelTab === 'block') {
        if (!state.selectedBlockId) return
        set({ rightPanelTab: 'block', rightPanelSheetOpen: true })
        return
      }
      if (state.rightPanelTab === 'block') commitRichTextDraft()
      set({
        rightPanelTab,
        lastPersistentPanelTab: rightPanelTab
      })
    },
    setRightPanelSheetOpen: (rightPanelSheetOpen) => set({ rightPanelSheetOpen }),
    selectPage: (selectedPageId) => {
      commitRichTextDraft()
      set({
        selectedPageId,
        selectedBlockId: null,
        ...restorePersistentPanel()
      })
    },
    selectBlock: (selectedPageId, selectedBlockId) => {
      const state = get()
      if (state.selectedBlockId !== selectedBlockId) commitRichTextDraft()
      set({
        selectedPageId,
        selectedBlockId,
        rightPanelTab: 'block',
        rightPanelSheetOpen: true
      })
    },
    clearBlockSelection: () => {
      commitRichTextDraft()
      set({ selectedBlockId: null, ...restorePersistentPanel() })
    },
    setRichTextDraft: (pageId, blockId, document, usedColors = []) => {
      const current = get().document
      const block = current?.pages
        .find((page) => page.id === pageId)
        ?.blocks.find((candidate) => candidate.id === blockId)
      if (!block || block.type !== 'rich-text') return
      clearRichTextCommitTimer()
      const previousDraft = get().richTextDraft
      const previousColors =
        previousDraft?.pageId === pageId && previousDraft.blockId === blockId
          ? (previousDraft.usedColors ?? [])
          : []
      set({
        richTextDraft: {
          pageId,
          blockId,
          document,
          usedColors: mergeRecentColors(usedColors, previousColors)
        }
      })
      richTextCommitTimer = setTimeout(() => {
        richTextCommitTimer = null
        get().commitRichTextDraft()
      }, RICH_TEXT_COMMIT_DELAY_MS)
    },
    commitRichTextDraft,
    toggleAsset: (assetId) =>
      set((state) => ({
        selectedAssetIds: state.selectedAssetIds.includes(assetId)
          ? state.selectedAssetIds.filter((id) => id !== assetId)
          : [...state.selectedAssetIds, assetId]
      })),
    setAssetSelection: (selectedAssetIds) => set({ selectedAssetIds }),
    clearAssetSelection: () => set({ selectedAssetIds: [] }),
    selectAllAssets: () =>
      set((state) => ({
        selectedAssetIds: state.document?.assets.map((asset) => asset.id) ?? []
      })),
    markAssetMissing: (assetId) =>
      set((state) => ({
        missingAssetIds: state.missingAssetIds.includes(assetId)
          ? state.missingAssetIds
          : [...state.missingAssetIds, assetId]
      })),
    markAssetAvailable: (assetId) =>
      set((state) => ({
        missingAssetIds: state.missingAssetIds.filter((id) => id !== assetId)
      })),
    dispatch: (command) => dispatchMany([command]),
    dispatchMany,
    connectPersistence: (saveDocument) => projectSaveSession.connect(saveDocument),
    flush: () => {
      commitRichTextDraft()
      return projectSaveSession.flush()
    },
    retrySave: () => projectSaveSession.retry(),
    undo: () => {
      commitRichTextDraft()
      const state = get()
      const entry = state.history.past.at(-1)
      if (!state.document || !entry) return
      const document = applyAlbumPatches(state.document, entry.inversePatches)
      set({
        ...blockSelectionPatch(document, state),
        document,
        history: {
          past: state.history.past.slice(0, -1),
          future: [entry, ...state.history.future].slice(0, 100)
        }
      })
      projectSaveSession.changed(document)
    },
    redo: () => {
      commitRichTextDraft()
      const state = get()
      const entry = state.history.future[0]
      if (!state.document || !entry) return
      const document = applyAlbumPatches(state.document, entry.patches)
      set({
        ...blockSelectionPatch(document, state),
        document,
        history: {
          past: [...state.history.past.slice(-99), entry],
          future: state.history.future.slice(1)
        }
      })
      projectSaveSession.changed(document)
    }
  }
})
