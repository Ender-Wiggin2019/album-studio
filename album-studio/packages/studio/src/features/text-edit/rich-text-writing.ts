import type { RichTextAlignment, RichTextWritingMode } from '@album-studio/common'
import type { CSSProperties } from 'react'

export const RICH_TEXT_WRITING_STYLES = Object.freeze({
  horizontal: Object.freeze({ writingMode: 'horizontal-tb' }),
  vertical: Object.freeze({ writingMode: 'vertical-rl', textOrientation: 'upright' })
}) satisfies Readonly<Record<RichTextWritingMode, CSSProperties>>

export function richTextAlignmentToCss(
  writingMode: RichTextWritingMode,
  alignment: RichTextAlignment
): 'left' | 'center' | 'right' | 'start' | 'end' {
  if (writingMode === 'horizontal' || alignment === 'center') return alignment
  return alignment === 'left' ? 'start' : 'end'
}
