import { DragDropProvider } from '@dnd-kit/react'
import type { ReactNode } from 'react'
import { useStudioStore } from '@/app/store'
import { buildDroppedBlockCommand } from './drop-coordinate'
import type { BlockPlacementDndData } from './payload'

export function BlockPlacementDragDropProvider({
  children
}: {
  children: ReactNode
}): React.JSX.Element {
  const dispatch = useStudioStore((state) => state.dispatch)
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
          clientPoint: position.current
        })
        if (command) dispatch(command)
      }}
    >
      {children}
    </DragDropProvider>
  )
}
