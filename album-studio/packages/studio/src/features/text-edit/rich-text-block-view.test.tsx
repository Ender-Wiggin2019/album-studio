import { RICH_TEXT_FORMAT_BITS, type RichTextDocument } from '@album-studio/common'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RichTextBlockView } from './rich-text-block-view'
import { richTextFontSizeToCqw } from './rich-text-metrics'

const document = {
  version: 1,
  root: {
    type: 'root',
    version: 1,
    children: [
      {
        type: 'paragraph',
        version: 1,
        align: 'center',
        lineHeight: 1.75,
        children: [
          {
            type: 'album-text',
            version: 1,
            text: '装订成册',
            format:
              RICH_TEXT_FORMAT_BITS.bold |
              RICH_TEXT_FORMAT_BITS.italic |
              RICH_TEXT_FORMAT_BITS.underline,
            fontFamily: 'lxgw-wenkai',
            fontSize: 36,
            color: '#6f4c35'
          }
        ]
      },
      {
        type: 'list',
        version: 1,
        listType: 'bullet',
        start: 1,
        align: 'left',
        lineHeight: 1.4,
        children: [
          {
            type: 'listitem',
            version: 1,
            value: 1,
            children: [
              {
                type: 'album-text',
                version: 1,
                text: '春日散步',
                format: 0,
                fontFamily: 'sans',
                fontSize: 18,
                color: '#234f4b'
              }
            ]
          }
        ]
      },
      {
        type: 'list',
        version: 1,
        listType: 'number',
        start: 3,
        align: 'right',
        lineHeight: 1.5,
        children: [
          {
            type: 'listitem',
            version: 1,
            value: 3,
            children: [
              {
                type: 'album-text',
                version: 1,
                text: '山顶日落',
                format: RICH_TEXT_FORMAT_BITS.bold,
                fontFamily: 'handwritten',
                fontSize: 22,
                color: '#a84835'
              }
            ]
          }
        ]
      }
    ]
  }
} as const satisfies RichTextDocument

describe('RichTextBlockView', () => {
  it('renders the strict paragraph and list subset without HTML injection', () => {
    const { container } = render(<RichTextBlockView document={document} pageWidthMm={297} />)

    expect(container.querySelector('.album-rich-text-block')).toHaveAttribute(
      'data-writing-mode',
      'horizontal'
    )
    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(container.querySelectorAll('ul')).toHaveLength(1)
    expect(container.querySelectorAll('ol')).toHaveLength(1)
    expect(container.querySelector('ol')).toHaveAttribute('start', '3')
    expect(screen.getByText('装订成册')).toHaveStyle({
      color: '#6f4c35',
      fontFamily: "'Album LXGW WenKai Lite', 'Kaiti SC', 'STKaiti', serif",
      fontWeight: '700',
      fontStyle: 'italic',
      textDecorationLine: 'underline'
    })
    expect(screen.getByText('春日散步')).toHaveStyle({ fontWeight: '400' })
    expect(screen.getByText('山顶日落')).toHaveStyle({ fontWeight: '700' })
    expect(container.querySelector('p')).toHaveStyle({ textAlign: 'center', lineHeight: '1.75' })
  })

  it('renders vertical text top-to-bottom in right-to-left upright columns', () => {
    const verticalProps = {
      document,
      pageWidthMm: 297,
      writingMode: 'vertical'
    } as Parameters<typeof RichTextBlockView>[0] & { writingMode: 'vertical' }
    const { container } = render(<RichTextBlockView {...verticalProps} />)

    expect(container.querySelector('.album-rich-text-block')).toHaveAttribute(
      'data-writing-mode',
      'vertical'
    )
    expect(container.querySelector('.album-rich-text-block')).toHaveStyle({
      writingMode: 'vertical-rl',
      textOrientation: 'upright'
    })
    expect(container.querySelector('p')).toHaveStyle({ textAlign: 'center' })
    expect(container.querySelector('ul')).toHaveStyle({ textAlign: 'start' })
    expect(container.querySelector('ol')).toHaveStyle({ textAlign: 'end' })
  })

  it('converts typographic points from the physical page width instead of CSS pixels', () => {
    const a4Landscape = richTextFontSizeToCqw(18, 297)
    const square = richTextFontSizeToCqw(18, 304.8)

    expect((a4Landscape * 297) / 100).toBeCloseTo(6.35, 5)
    expect((square * 304.8) / 100).toBeCloseTo(6.35, 5)
    expect(a4Landscape).toBeCloseTo(2.138047, 5)
  })
})
