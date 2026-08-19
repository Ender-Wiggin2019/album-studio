import { describe, expect, it } from 'vitest'
import { ERASE_PIPELINE_VERSION, eraseKeyFor, type ImageErase } from '../src'

const BASE: ImageErase = {
  autoDetect: true,
  strokes: [
    {
      mode: 'add',
      size: 0.04,
      points: [
        { x: 0.5, y: 0.5 },
        { x: 0.55, y: 0.6 }
      ]
    }
  ]
}

describe('eraseKeyFor', () => {
  it('is stable for identical parameters regardless of key order', () => {
    const first = eraseKeyFor(BASE)
    const reordered = eraseKeyFor({
      strokes: BASE.strokes,
      autoDetect: BASE.autoDetect
    })
    expect(first).toBe(reordered)
    expect(first).toMatch(new RegExp(`^e${ERASE_PIPELINE_VERSION}`))
    expect(first).toMatch(/^[0-9a-z]+$/)
  })

  it('changes when parameters change', () => {
    const base = eraseKeyFor(BASE)
    expect(eraseKeyFor({ autoDetect: false, strokes: BASE.strokes })).not.toBe(base)
    expect(
      eraseKeyFor({
        autoDetect: true,
        strokes: [{ ...BASE.strokes[0], size: 0.05 }]
      })
    ).not.toBe(base)
    expect(
      eraseKeyFor({
        autoDetect: true,
        strokes: [
          BASE.strokes[0],
          {
            mode: 'subtract',
            size: 0.03,
            points: [
              { x: 0.1, y: 0.1 },
              { x: 0.2, y: 0.2 }
            ]
          }
        ]
      })
    ).not.toBe(base)
  })
})
