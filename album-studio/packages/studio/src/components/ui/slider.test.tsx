import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Slider } from './slider'

describe('Slider accessibility', () => {
  it('forwards the accessible label to the interactive thumb', () => {
    render(<Slider aria-label="亮度" defaultValue={[1]} min={0} max={2} />)

    expect(screen.getByRole('slider', { name: '亮度' })).toBeVisible()
  })

  it('gives multiple thumbs distinct names', () => {
    render(<Slider aria-label="范围" defaultValue={[20, 80]} min={0} max={100} />)

    expect(screen.getByRole('slider', { name: '范围 1' })).toBeVisible()
    expect(screen.getByRole('slider', { name: '范围 2' })).toBeVisible()
  })
})
