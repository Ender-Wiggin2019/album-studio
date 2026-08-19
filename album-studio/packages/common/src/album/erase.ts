import type { ImageErase } from './schema'

/**
 * 消除参数的稳定缓存键。
 *
 * 消除结果派生缓存需要与"参数"一一对应：相同参数（自动识别开关 + 笔划）
 * 必须得到相同键，参数变化必须得到不同键。这里使用规范化 JSON（键排序）
 * 加双 FNV-1a 哈希，双端（renderer 与 main）调用同一 common 实现，保证一致。
 * 仅用于缓存命名，不承担安全职责。
 */
export function eraseKeyFor(erase: ImageErase): string {
  const canonical = canonicalize(erase)
  const first = fnv1a(`${canonical}\u0001`)
  const second = fnv1a(`${canonical}\u0002`)
  return `${first.toString(36)}${second.toString(36)}`
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
