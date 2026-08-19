import { useEffect, useRef, useState } from 'react'
import { beautifyImageSource, type EnhanceParams } from './beautify-image-source'

type BeautifiedSourceState = {
  source: string | null
  failed: boolean
}

type BeautifyResult = {
  /** 生成该结果时的 source + 参数 key，用于丢弃过期结果。 */
  key: string
  url: string
}

const INITIAL_STATE: BeautifiedSourceState = { source: null, failed: false }

/** 连续滑块拖动时合并处理请求的防抖窗口（毫秒）。 */
const BEAUTY_DEBOUNCE_MS = 120

function isEnhanceActive(params: EnhanceParams): boolean {
  return params.beautySmooth > 0 || params.beautyWhiten > 0 || params.clarity > 0
}

function resultKey(source: string, params: EnhanceParams): string {
  return `${source}|${params.beautySmooth}|${params.beautyWhiten}|${params.clarity}`
}

/**
 * 对已获取的资源 URL 应用磨皮/美白/清晰度，并管理处理结果 blob URL 的生命周期。
 *
 * - 增强参数全为 0 或资源尚未就绪时直接透传原 URL（零开销，不产生 blob）。
 * - 参数/资源变化时防抖 120ms 后重新处理；渲染期按 key 匹配结果，过期结果不显示。
 * - 处理失败时降级返回原 URL（显示原图），不影响画布可用性。
 * - 组件卸载、参数归零或依赖变化时 revoke 已生成的处理 blob。
 */
export function useBeautifiedSource(
  source: string | null,
  params: EnhanceParams,
  maxEdge?: number
): BeautifiedSourceState {
  const [result, setResult] = useState<BeautifyResult | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const requestRef = useRef(0)
  const active = source !== null && isEnhanceActive(params)
  const key = source ? resultKey(source, params) : ''

  useEffect(() => {
    if (!active || !source) return
    const requestId = ++requestRef.current
    let settled = false
    const currentKey = resultKey(source, params)

    const timer = window.setTimeout(() => {
      void beautifyImageSource(source, params, maxEdge)
        .then((nextSource) => {
          if (requestId !== requestRef.current) {
            // 迟到的旧结果：释放它生成的 blob，避免泄漏
            if (nextSource !== source) URL.revokeObjectURL(nextSource)
            return
          }
          settled = true
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
          blobUrlRef.current = nextSource !== source ? nextSource : null
          setResult({ key: currentKey, url: nextSource })
        })
        .catch(() => {
          if (requestId !== requestRef.current) return
          settled = true
          setResult({ key: currentKey, url: source })
        })
    }, BEAUTY_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      if (requestId !== requestRef.current) return
      requestRef.current += 1
      if (!settled && blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [active, params.beautySmooth, params.beautyWhiten, params.clarity, maxEdge, source])

  // 参数归零或资源失效时释放已生成的处理 blob（不触发渲染）
  useEffect(() => {
    if (active) return
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [active])

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [])

  if (!source) return INITIAL_STATE
  if (!active || !result || result.key !== key) return { source, failed: false }
  return { source: result.url, failed: false }
}
