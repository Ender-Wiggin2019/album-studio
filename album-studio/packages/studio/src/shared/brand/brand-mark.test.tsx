import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandMark } from './brand-mark'

describe('BrandMark', () => {
  it('renders the shared logo at the requested semantic size', () => {
    const { container, rerender } = render(<BrandMark alt="" />)
    const decorativeMark = container.querySelector('img[alt=""]')

    expect(decorativeMark).toHaveAttribute('width', '40')
    expect(decorativeMark).toHaveAttribute('height', '40')

    rerender(<BrandMark alt="咔宝" variant="compact" />)
    const compactMark = screen.getByRole('img', { name: '咔宝' })

    expect(compactMark).toHaveAttribute('width', '32')
    expect(compactMark).toHaveAttribute('height', '32')
    expect(compactMark).toHaveClass('sm:block')
  })
})
