import {
  type ErasePoint,
  type EraseStroke
} from '@album-studio/common'
import {
  CheckIcon,
  EraserIcon,
  PaintbrushIcon,
  RotateCcwIcon,
  SparklesIcon,
  Undo2Icon,
  Wand2Icon
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStudioPlatform } from '@/app/platform/use-studio-platform'
import { useStudioStore } from '@/app/store'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Slider } from '@/components/ui/slider'
import { useAssetSource } from '@/shared/assets/use-asset-source'
import { fitErasePhotoSize } from './erase-people-geometry'

type Phase = 'edit' | 'processing' | 'preview'
type Tool = 'brush' | 'eraser'

const MASK_COLOR = 'rgba(244, 63, 94, 0.75)'
const DARK_OUTLINE_BUTTON =
  'border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white'

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function ErasePeopleWorkspace(): React.JSX.Element {
  const platform = useStudioPlatform()
  const document = useStudioStore((state) => state.document)
  const selectedPageId = useStudioStore((state) => state.selectedPageId)
  const selectedBlockId = useStudioStore((state) => state.selectedBlockId)
  const setExclusiveWorkspace = useStudioStore((state) => state.setExclusiveWorkspace)
  const dispatch = useStudioStore((state) => state.dispatch)

  const page = document?.pages.find((candidate) => candidate.id === selectedPageId)
  const selectedBlock = selectedBlockId
    ? page?.blocks.find((candidate) => candidate.id === selectedBlockId)
    : undefined
  const imageBlock = selectedBlock?.type === 'image' ? selectedBlock : undefined
  const asset = document?.assets.find((candidate) => candidate.id === imageBlock?.assetId)
  const { source } = useAssetSource(document?.id ?? '', asset?.id ?? null, {
    quality: 'original'
  })

  const [strokes, setStrokes] = useState<EraseStroke[]>(() =>
    structuredClone(imageBlock?.erase?.strokes ?? [])
  )
  const [autoDetect, setAutoDetect] = useState(() => imageBlock?.erase?.autoDetect ?? false)
  const [autoMask, setAutoMask] = useState<ImageBitmap | null>(null)
  const [tool, setTool] = useState<Tool>('brush')
  const [brushSize, setBrushSize] = useState(0.06)
  const [phase, setPhase] = useState<Phase>('edit')
  const [showResult, setShowResult] = useState(true)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewSource, setPreviewSource] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [fitSize, setFitSize] = useState<{ width: number; height: number } | null>(null)
  const drawingRef = useRef(false)
  const activeStrokeRef = useRef<ErasePoint[] | null>(null)
  const previewSourceRef = useRef<string | null>(null)

  const releasePreview = useCallback(() => {
    if (previewSourceRef.current) {
      platform.assets.releaseSource(previewSourceRef.current)
      previewSourceRef.current = null
    }
    setPreviewSource(null)
  }, [platform])

  useEffect(() => {
    return releasePreview
  }, [releasePreview])

  // 让照片在舞台内完整可见：按舞台实际尺寸计算 contain 尺寸，避免竖图撑破舞台被裁剪
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage || !asset) return
    const update = (): void => {
      setFitSize(
        fitErasePhotoSize(
          asset.width / asset.height,
          stage.clientWidth * 0.86,
          stage.clientHeight * 0.86
        )
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(stage)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [asset])

  const drawOverlay = useCallback((): void => {
    const canvas = canvasRef.current
    const box = boxRef.current
    if (!canvas || !box) return
    const cssWidth = box.clientWidth
    const cssHeight = box.clientHeight
    if (cssWidth < 1 || cssHeight < 1) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
      canvas.width = Math.round(cssWidth * dpr)
      canvas.height = Math.round(cssHeight * dpr)
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssWidth, cssHeight)
    if (autoMask) {
      ctx.drawImage(autoMask, 0, 0, cssWidth, cssHeight)
      ctx.globalCompositeOperation = 'source-in'
      ctx.fillStyle = MASK_COLOR
      ctx.fillRect(0, 0, cssWidth, cssHeight)
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const stroke of strokes) {
      ctx.strokeStyle = MASK_COLOR
      ctx.lineWidth = stroke.size * cssWidth
      ctx.globalCompositeOperation = stroke.mode === 'subtract' ? 'destination-out' : 'source-over'
      ctx.beginPath()
      stroke.points.forEach((point, index) => {
        const x = point.x * cssWidth
        const y = point.y * cssHeight
        if (index === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'
  }, [autoMask, strokes])

  useEffect(() => {
    drawOverlay()
  }, [drawOverlay, phase, source, fitSize])

  const pointFromEvent = (event: React.PointerEvent): ErasePoint => {
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect || rect.width < 1 || rect.height < 1) return { x: 0, y: 0 }
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height)
    }
  }

  const drawSegment = (from: ErasePoint | null, to: ErasePoint): void => {
    const canvas = canvasRef.current
    const box = boxRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !box) return
    const cssWidth = box.clientWidth
    const cssHeight = box.clientHeight
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = brushSize * cssWidth
    ctx.strokeStyle = MASK_COLOR
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.beginPath()
    ctx.moveTo(from ? from.x * cssWidth : to.x * cssWidth, from ? from.y * cssHeight : to.y * cssHeight)
    ctx.lineTo(to.x * cssWidth, to.y * cssHeight)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }

  const handlePointerDown = (event: React.PointerEvent): void => {
    if (phase !== 'edit') return
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = true
    const point = pointFromEvent(event)
    activeStrokeRef.current = [point]
    drawSegment(null, point)
  }

  const handlePointerMove = (event: React.PointerEvent): void => {
    if (!drawingRef.current || phase !== 'edit') return
    const point = pointFromEvent(event)
    const previous = activeStrokeRef.current?.at(-1)
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) < 0.002) return
    activeStrokeRef.current!.push(point)
    drawSegment(previous, point)
  }

  const handlePointerUp = (): void => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const points = activeStrokeRef.current
    activeStrokeRef.current = null
    if (points && points.length >= 2) {
      const stroke: EraseStroke = {
        mode: tool === 'eraser' ? 'subtract' : 'add',
        size: brushSize,
        points
      }
      setStrokes((current) => [...current, stroke])
    }
  }

  const runDetect = async (): Promise<void> => {
    if (!document || !asset) return
    setError(null)
    setBusyMessage('正在识别人物…')
    try {
      const result = await platform.imageErase.detect(document.id, asset.id)
      const bytes = Uint8Array.from(atob(result.maskBase64), (char) => char.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      setAutoMask(bitmap)
      setAutoDetect(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '自动识别人物失败')
    } finally {
      setBusyMessage(null)
    }
  }

  const toggleAutoDetect = (): void => {
    if (autoDetect) {
      setAutoDetect(false)
      setAutoMask(null)
      return
    }
    void runDetect()
  }

  const applyErase = async (): Promise<void> => {
    if (!document || !asset) return
    setError(null)
    setPhase('processing')
    setBusyMessage('正在修补照片，大约需要几秒…')
    try {
      const result = await platform.imageErase.apply(document.id, asset.id, {
        autoDetect,
        strokes
      })
      const preview = await platform.assets.getSource(document.id, asset.id, {
        quality: 'erased',
        eraseKey: result.eraseKey
      })
      releasePreview()
      previewSourceRef.current = preview
      setPreviewSource(preview)
      setShowResult(true)
      setPhase('preview')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '应用消除失败')
      setPhase('edit')
    } finally {
      setBusyMessage(null)
    }
  }

  const confirmApply = (): void => {
    if (!page || !imageBlock) return
    dispatch({
      type: 'set-image-erase',
      pageId: page.id,
      blockId: imageBlock.id,
      erase: { autoDetect, strokes }
    })
    releasePreview()
    setExclusiveWorkspace(null)
  }

  const backToEdit = (): void => {
    releasePreview()
    setPhase('edit')
  }

  const cancel = (): void => {
    releasePreview()
    setExclusiveWorkspace(null)
  }

  const reset = (): void => {
    setStrokes([])
    setAutoDetect(false)
    setAutoMask(null)
    setError(null)
  }

  if (!document || !page || !imageBlock || !asset) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="text-center">
          <p className="font-medium">这张照片暂时无法编辑</p>
          <Button className="mt-4" variant="outline" onClick={cancel}>
            返回排版
          </Button>
        </div>
      </div>
    )
  }

  const hasMask = autoDetect || strokes.length > 0

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-[#171a1f] text-white"
      aria-label="消除人物"
    >
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-white/10 px-5">
        <div>
          <p className="text-sm font-semibold">{asset.fileName}</p>
          <p className="text-xs text-white/55">
            {phase === 'preview'
              ? '预览修补结果，确认后应用到照片'
              : '涂刷要消除的人物，或自动识别后微调'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={phase === 'preview' ? backToEdit : cancel}
          >
            {phase === 'preview' ? '返回修改' : '取消'}
          </Button>
          {phase === 'preview' ? (
            <Button onClick={confirmApply}>
              <CheckIcon data-icon="inline-start" />
              确认应用
            </Button>
          ) : (
            <Button onClick={() => void applyErase()} disabled={!hasMask || phase === 'processing'}>
              <Wand2Icon data-icon="inline-start" />
              应用消除
            </Button>
          )}
        </div>
      </header>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div ref={stageRef} className="relative min-h-[320px] overflow-hidden bg-[#0f1114]">
          {phase === 'preview' ? (
            <div className="absolute inset-[7%] grid place-items-center">
              {previewSource ? (
                <img
                  src={showResult ? previewSource : source ?? undefined}
                  alt="消除结果预览"
                  className="max-h-full max-w-full object-contain shadow-2xl"
                  style={{
                    width: fitSize ? `${fitSize.width}px` : undefined,
                    height: fitSize ? `${fitSize.height}px` : undefined
                  }}
                />
              ) : (
                <p className="text-sm text-white/60">正在读取结果…</p>
              )}
            </div>
          ) : source ? (
            <div
              ref={boxRef}
              className="absolute overflow-hidden shadow-2xl"
              style={{
                width: fitSize ? `${fitSize.width}px` : undefined,
                height: fitSize ? `${fitSize.height}px` : undefined,
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)'
              }}
            >
              <img
                src={source}
                alt="待消除人物的照片"
                className="block size-full object-fill"
                draggable={false}
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 size-full cursor-crosshair touch-none"
                aria-label="人物遮罩涂刷区域"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              />
            </div>
          ) : (
            <div className="grid size-full place-items-center text-sm text-white/60">
              正在读取原图…
            </div>
          )}
          {busyMessage ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40">
              <p className="rounded-lg bg-black/70 px-4 py-2 text-sm">{busyMessage}</p>
            </div>
          ) : null}
          {error ? (
            <div className="absolute inset-x-0 bottom-0 bg-red-950/90 px-4 py-2 text-sm text-red-100">
              {error}
            </div>
          ) : null}
        </div>
        <aside className="min-h-0 overflow-y-auto border-l border-white/10 bg-[#1d2025] p-5">
          <FieldGroup>
            {phase === 'preview' ? (
              <FieldGroup>
                <Field>
                  <FieldLabel>对比</FieldLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={showResult ? 'default' : 'outline'}
                      className={showResult ? undefined : DARK_OUTLINE_BUTTON}
                      onClick={() => setShowResult(true)}
                    >
                      修补结果
                    </Button>
                    <Button
                      variant={showResult ? 'outline' : 'default'}
                      className={showResult ? DARK_OUTLINE_BUTTON : undefined}
                      onClick={() => setShowResult(false)}
                    >
                      原图
                    </Button>
                  </div>
                </Field>
                <p className="text-xs leading-relaxed text-white/55">
                  确认后消除结果会保存到照片上，裁剪与滤镜等编辑会继续生效；随时可以重新打开本工具修改遮罩。
                </p>
              </FieldGroup>
            ) : (
              <>
                <Field>
                  <FieldLabel>自动识别</FieldLabel>
                  <Button
                    variant="outline"
                    className={`w-full ${autoDetect ? '' : DARK_OUTLINE_BUTTON}`}
                    onClick={toggleAutoDetect}
                    disabled={phase === 'processing' || busyMessage !== null}
                  >
                    <SparklesIcon data-icon="inline-start" />
                    {autoDetect ? '已识别：关闭自动遮罩' : '自动识别人物'}
                  </Button>
                </Field>

                <Field>
                  <FieldLabel>工具</FieldLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={tool === 'brush' ? 'default' : 'outline'}
                      className={tool === 'brush' ? undefined : DARK_OUTLINE_BUTTON}
                      onClick={() => setTool('brush')}
                    >
                      <PaintbrushIcon data-icon="inline-start" />
                      涂刷
                    </Button>
                    <Button
                      variant={tool === 'eraser' ? 'default' : 'outline'}
                      className={tool === 'eraser' ? undefined : DARK_OUTLINE_BUTTON}
                      onClick={() => setTool('eraser')}
                    >
                      <EraserIcon data-icon="inline-start" />
                      橡皮
                    </Button>
                  </div>
                </Field>

                <Field>
                  <div className="flex justify-between">
                    <FieldLabel>笔刷大小</FieldLabel>
                    <span className="font-mono text-xs text-white/55">
                      {Math.round(brushSize * 100)}%
                    </span>
                  </div>
                  <Slider
                    aria-label="笔刷大小"
                    min={1}
                    max={20}
                    step={1}
                    value={[Math.round(brushSize * 100)]}
                    onValueChange={(value) => setBrushSize(value[0] / 100)}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className={DARK_OUTLINE_BUTTON}
                    onClick={() => setStrokes((current) => current.slice(0, -1))}
                    disabled={strokes.length === 0}
                  >
                    <Undo2Icon data-icon="inline-start" />
                    撤销笔划
                  </Button>
                  <Button
                    variant="outline"
                    className={DARK_OUTLINE_BUTTON}
                    onClick={reset}
                    disabled={!hasMask}
                  >
                    <RotateCcwIcon data-icon="inline-start" />
                    清除全部
                  </Button>
                </div>

                <p className="text-xs leading-relaxed text-white/55">
                  在照片上涂刷要消除的人物。先点“自动识别人物”会标出照片里的人，再用涂刷/橡皮微调；点击“应用消除”开始修补，耗时约几秒。
                </p>
              </>
            )}
          </FieldGroup>
        </aside>
      </div>
    </section>
  )
}
