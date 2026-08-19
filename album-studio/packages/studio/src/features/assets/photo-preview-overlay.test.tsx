import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PhotoPreviewOverlay } from './photo-preview-overlay'

describe('PhotoPreviewOverlay', () => {
  afterEach(cleanup)

  it('消费方向键并只在范围内切换照片', () => {
    const onIndexChange = vi.fn()
    render(
      <PhotoPreviewOverlay
        items={[
          { id: 'a', label: 'A', renderLarge: () => <img alt="A" /> },
          { id: 'b', label: 'B', renderLarge: () => <img alt="B" /> }
        ]}
        index={0}
        onIndexChange={onIndexChange}
        onClose={vi.fn()}
      />
    )

    const previous = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true
    })
    document.dispatchEvent(previous)
    expect(previous.defaultPrevented).toBe(true)
    expect(onIndexChange).not.toHaveBeenCalled()

    const next = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    })
    document.dispatchEvent(next)
    expect(next.defaultPrevented).toBe(true)
    expect(onIndexChange).toHaveBeenCalledWith(1)
  })
})
