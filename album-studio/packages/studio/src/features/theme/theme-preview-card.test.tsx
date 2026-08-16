import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ThemePreviewCard } from './theme-preview-card'

describe('ThemePreviewCard', () => {
  it('exposes its selected state and entire card as the action target', async () => {
    const onSelect = vi.fn()
    render(<ThemePreviewCard themeId="journal" selected onSelect={onSelect} />)

    const card = screen.getByRole('radio', { name: /旅途手账/ })
    expect(card).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(card)
    expect(onSelect).toHaveBeenCalledOnce()
  })
})
