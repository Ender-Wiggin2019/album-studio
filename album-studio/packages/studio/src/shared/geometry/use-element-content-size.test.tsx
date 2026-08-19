import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useElementContentSize } from './use-element-content-size'

function SizeHarness({ showElement }: { showElement: boolean }): React.JSX.Element {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const size = useElementContentSize(element)
  const setMeasuredElement = useCallback((node: HTMLDivElement | null): void => {
    if (node) {
      Object.defineProperties(node, {
        clientWidth: { configurable: true, value: 600 },
        clientHeight: { configurable: true, value: 400 }
      })
    }
    setElement(node)
  }, [])

  return (
    <>
      <output>{size ? `${size.width} × ${size.height}` : '尚未测量'}</output>
      {showElement ? <div ref={setMeasuredElement} style={{ padding: '20px 30px' }} /> : null}
    </>
  )
}

afterEach(cleanup)

describe('useElementContentSize', () => {
  it('starts measuring when a conditionally rendered element mounts', async () => {
    const view = render(<SizeHarness showElement={false} />)
    expect(screen.getByText('尚未测量')).toBeInTheDocument()

    view.rerender(<SizeHarness showElement />)

    await waitFor(() => expect(screen.getByText('540 × 360')).toBeInTheDocument())
  })
})
