import { RichTextDocumentSchema, createRichTextDocument } from '@album-studio/common'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { RichTextEditor } from './rich-text-editor'

beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => DOMRect.fromRect()
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
})

afterEach(cleanup)

describe('RichTextEditor', () => {
  it('renders the restricted accessible toolbar and emits verified documents while typing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onBlur = vi.fn()
    render(
      <div>
        <RichTextEditor
          autoFocus
          document={createRichTextDocument('初始文字')}
          onBlur={onBlur}
          onChange={onChange}
        />
        <button type="button">移出焦点</button>
      </div>
    )

    const editor = screen.getByRole('textbox', { name: '富文本内容' })
    expect(editor).toHaveTextContent('初始文字')
    expect(editor).toHaveAttribute('data-writing-mode', 'horizontal')
    expect(screen.getByRole('toolbar', { name: '文字格式' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '字体' })).toHaveTextContent('黑体')
    expect(screen.getByRole('spinbutton', { name: '字号' })).toHaveAttribute('min', '8')
    expect(screen.getByRole('spinbutton', { name: '行距' })).toHaveAttribute('max', '2.5')
    expect(screen.getByRole('button', { name: '粗体' })).toHaveAttribute('title', '粗体')
    expect(screen.getByRole('radio', { name: '项目符号列表' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '编号列表' })).toBeInTheDocument()

    await waitFor(() => expect(editor).toHaveFocus())
    await user.type(editor, '追加')

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const latestDocument = onChange.mock.lastCall?.[0]
    expect(() => RichTextDocumentSchema.parse(latestDocument)).not.toThrow()
    expect(JSON.stringify(latestDocument)).toContain('追加')

    await user.click(screen.getByText('移出焦点'))
    expect(onBlur).toHaveBeenCalledOnce()
  })

  it('edits vertical text in upright columns with top and bottom alignment labels', () => {
    const onChange = vi.fn()
    const props = {
      document: createRichTextDocument('中英数123'),
      onChange
    }
    const view = render(<RichTextEditor {...props} />)

    const editor = screen.getByRole('textbox', { name: '富文本内容' })
    expect(editor).toHaveAttribute('data-writing-mode', 'horizontal')
    view.rerender(<RichTextEditor {...props} writingMode="vertical" />)

    expect(editor).toHaveAttribute('data-writing-mode', 'vertical')
    expect(editor).toHaveStyle({ writingMode: 'vertical-rl', textOrientation: 'upright' })
    expect(editor).toHaveClass('w-full', 'min-w-0', 'max-w-full', 'overflow-x-auto')
    expect(editor.querySelector('p')).toHaveStyle({ textAlign: 'start' })
    expect(screen.getByRole('radio', { name: '顶部对齐' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '底部对齐' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '左对齐' })).toBeNull()
    expect(screen.queryByRole('radio', { name: '右对齐' })).toBeNull()
  })

  it('formats the whole block without an editor selection and offers project colors for reuse', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <RichTextEditor
        document={createRichTextDocument('未进入编辑状态')}
        onChange={onChange}
        recentColors={['#a84835', '#234f4b']}
      />
    )

    const editor = screen.getByRole('textbox', { name: '富文本内容' })
    expect(editor).not.toHaveFocus()
    fireEvent.change(screen.getByRole('spinbutton', { name: '字号' }), {
      target: { value: '36' }
    })
    await waitFor(() => {
      const latest = RichTextDocumentSchema.parse(onChange.mock.lastCall?.[0])
      const paragraph = latest.root.children[0]
      expect(paragraph.type).toBe('paragraph')
      if (paragraph.type === 'paragraph') {
        expect(paragraph.children).toEqual([
          expect.objectContaining({ text: '未进入编辑状态', fontSize: 36 })
        ])
      }
    })

    fireEvent.change(screen.getByLabelText('文字颜色'), { target: { value: '#c62828' } })
    await waitFor(() => {
      const latest = RichTextDocumentSchema.parse(onChange.mock.lastCall?.[0])
      const paragraph = latest.root.children[0]
      expect(paragraph.type).toBe('paragraph')
      if (paragraph.type === 'paragraph') {
        expect(paragraph.children).toEqual([
          expect.objectContaining({ text: '未进入编辑状态', color: '#c62828' })
        ])
      }
      expect(onChange.mock.lastCall?.[1]).toContain('#c62828')
    })

    await user.click(screen.getByRole('radio', { name: '使用项目颜色 #234f4b' }))
    await waitFor(() => {
      const latest = RichTextDocumentSchema.parse(onChange.mock.lastCall?.[0])
      const paragraph = latest.root.children[0]
      expect(paragraph.type).toBe('paragraph')
      if (paragraph.type === 'paragraph') {
        expect(paragraph.children[0]).toMatchObject({ color: '#234f4b' })
      }
    })
  })

  it('restores an externally changed document without echoing it back through onChange', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <div>
        <RichTextEditor document={createRichTextDocument('编辑中')} onChange={onChange} />
        <button type="button">移出焦点</button>
      </div>
    )

    rerender(
      <div>
        <RichTextEditor document={createRichTextDocument('已撤销')} onChange={onChange} />
        <button type="button">移出焦点</button>
      </div>
    )

    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: '富文本内容' })).toHaveTextContent('已撤销')
    )
    expect(onChange).not.toHaveBeenCalled()
  })

  it('persists supported inline, block and list formatting through the verified document', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <RichTextEditor autoFocus document={createRichTextDocument('列表项')} onChange={onChange} />
    )

    const editor = screen.getByRole('textbox', { name: '富文本内容' })
    await waitFor(() => expect(editor).toHaveFocus())
    await user.keyboard('{Control>}a{/Control}')
    await user.click(screen.getByRole('button', { name: '粗体' }))

    await waitFor(() => {
      const latest = RichTextDocumentSchema.parse(onChange.mock.lastCall?.[0])
      const paragraph = latest.root.children[0]
      expect(paragraph.type).toBe('paragraph')
      if (paragraph.type === 'paragraph') {
        expect(paragraph.children.at(-1)).toMatchObject({ text: '列表项', format: 1 })
      }
    })

    await user.click(screen.getByRole('radio', { name: '居中对齐' }))
    const lineHeight = screen.getByRole('spinbutton', { name: '行距' })
    await user.clear(lineHeight)
    await user.type(lineHeight, '2')
    await user.click(screen.getByRole('radio', { name: '项目符号列表' }))

    await waitFor(() => {
      const latest = RichTextDocumentSchema.parse(onChange.mock.lastCall?.[0])
      expect(latest.root.children[0]).toMatchObject({
        type: 'list',
        listType: 'bullet',
        align: 'center',
        lineHeight: 2
      })
    })
  })

  it('pastes plain text as supported paragraphs without line-break or tab nodes', async () => {
    const onChange = vi.fn()
    render(<RichTextEditor autoFocus document={createRichTextDocument()} onChange={onChange} />)

    const editor = screen.getByRole('textbox', { name: '富文本内容' })
    await waitFor(() => expect(editor).toHaveFocus())
    fireEvent.paste(editor, {
      clipboardData: { getData: () => '甲\n乙\t丙' }
    })

    await waitFor(() => {
      const latest = RichTextDocumentSchema.parse(onChange.mock.lastCall?.[0])
      expect(latest.root.children).toHaveLength(2)
      expect(JSON.stringify(latest)).toContain('乙  丙')
    })
  })
})
