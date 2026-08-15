import { useEffect, useRef } from 'react'
import { useStudioStore } from './store'

export function useAutoSave(): void {
  const project = useStudioStore((state) => state.project)
  const projectPath = useStudioStore((state) => state.projectPath)
  const saveState = useStudioStore((state) => state.saveState)
  const markSaving = useStudioStore((state) => state.markSaving)
  const markSaved = useStudioStore((state) => state.markSaved)
  const markSaveError = useStudioStore((state) => state.markSaveError)
  const sequence = useRef(0)

  useEffect(() => {
    if (!project || !projectPath || saveState !== 'dirty') return
    const currentSequence = ++sequence.current
    const timer = window.setTimeout(async () => {
      markSaving()
      try {
        const result = await window.albumStudio.projects.save({ projectPath, project })
        if (currentSequence === sequence.current) markSaved(result.revision)
      } catch (error) {
        if (currentSequence === sequence.current) {
          markSaveError(error instanceof Error ? error.message : '保存失败')
        }
      }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [markSaveError, markSaved, markSaving, project, projectPath, saveState])
}
