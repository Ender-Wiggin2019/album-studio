import { DragDropProvider } from '@dnd-kit/react'
import type { ReactNode } from 'react'
import type { AlbumDocument } from '@album-studio/common'
import { useStudioStore } from '@/app/store'
import { buildDroppedBlockCommand, type AssetPixelSize } from './drop-coordinate'
import { isBlockPlacementPayload, type BlockPlacementDndData } from './payload'

function assetSizeForSource(
  document: AlbumDocument | null,
  sourceData: unknown
): AssetPixelSize | undefined {
  if (!document || !isBlockPlacementPayload(sourceData) || sourceData.kind !== 'asset') {
    return undefined
  }
  const asset = document.assets.find((candidate) => candidate.id === sourceData.assetId)
  return asset ? { width: asset.width, height: asset.height } : undefined
}

export function BlockPlacementDragDropProvider({
  children
}: {
  children: ReactNode
}): React.JSX.Element {
  const dispatch = useStudioStore((state) => state.dispatch)
  const document = useStudioStore((state) => state.document)
  return (
    <DragDropProvider<BlockPlacementDndData>
      onDragEnd={(event) => {
        const { source, target, position } = event.operation
        const targetElement = target?.element
        const command = buildDroppedBlockCommand({
          canceled: event.canceled,
          sourceData: source?.data,
          targetData: target?.data,
          targetRect: targetElement ? targetElement.getBoundingClientRect() : null,
          clientPoint: position.current,
          assetSize: assetSizeForSource(document, source?.data),
          pageSpec: document?.pageSpec
        })
        if (command) dispatch(command)
      }}
    >
      {children}
    </DragDropProvider>
  )
}
