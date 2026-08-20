import {
  MAX_RICH_TEXT_CHARACTERS,
  RICH_TEXT_FORMAT_BITS,
  type RichTextDocument
} from '@album-studio/common'
import { describe, expect, it } from 'vitest'
import {
  lexicalEditorStateToRichTextDocument,
  richTextDocumentToLexicalEditorState
} from './lexical-adapter'
import { ListItemNode, ListNode } from '@lexical/list'
import { createEditor } from 'lexical'

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
        lineHeight: 1.8,
        children: [
          {
            type: 'album-text',
            version: 1,
            text: '春日相册',
            format: RICH_TEXT_FORMAT_BITS.bold | RICH_TEXT_FORMAT_BITS.italic,
            fontFamily: 'smiley-sans',
            fontSize: 32,
            color: '#6f4c35'
          },
          {
            type: 'album-text',
            version: 1,
            text: '· 2026',
            format: RICH_TEXT_FORMAT_BITS.underline,
            fontFamily: 'mono',
            fontSize: 16,
            color: '#234f4b'
          }
        ]
      },
      {
        type: 'list',
        version: 1,
        listType: 'number',
        start: 3,
        align: 'right',
        lineHeight: 1.4,
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
                format: 0,
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

function cloneLexicalState(): Record<string, unknown> {
  return structuredClone(richTextDocumentToLexicalEditorState(document)) as Record<string, unknown>
}

function firstTextNode(state: Record<string, unknown>): Record<string, unknown> {
  const root = state.root as Record<string, unknown>
  const paragraph = (root.children as Record<string, unknown>[])[0]
  return (paragraph.children as Record<string, unknown>[])[0]
}

describe('lexical adapter', () => {
  it('round-trips the supported document through standard Lexical node JSON', () => {
    const lexicalState = richTextDocumentToLexicalEditorState(document)

    expect(firstTextNode(lexicalState as Record<string, unknown>)).toMatchObject({
      type: 'text',
      version: 1,
      text: '春日相册'
    })
    expect(JSON.stringify(lexicalState)).not.toContain('album-text')
    expect(lexicalEditorStateToRichTextDocument(lexicalState)).toEqual(document)
  })

  it('is accepted and re-exported by the installed Lexical runtime', () => {
    const editor = createEditor({
      namespace: 'lexical-adapter-test',
      nodes: [ListNode, ListItemNode],
      onError: (error) => {
        throw error
      }
    })
    const editorState = editor.parseEditorState(
      JSON.stringify(richTextDocumentToLexicalEditorState(document))
    )

    expect(lexicalEditorStateToRichTextDocument(editorState.toJSON())).toEqual(document)
  })

  it.each([
    ['unknown node', (state: Record<string, unknown>) => (firstTextNode(state).type = 'link')],
    [
      'unknown mark',
      (state: Record<string, unknown>) => (firstTextNode(state).marks = ['comment'])
    ],
    [
      'unsupported format bit',
      (state: Record<string, unknown>) => (firstTextNode(state).format = 4)
    ],
    [
      'arbitrary text style',
      (state: Record<string, unknown>) =>
        (firstTextNode(state).style =
          'font-family: serif; font-size: 32px; color: #6f4c35; background-color: red;')
    ],
    [
      'unknown node state',
      (state: Record<string, unknown>) => {
        const root = state.root as Record<string, unknown>
        const paragraph = (root.children as Record<string, unknown>[])[0]
        paragraph.$ = { albumLineHeight: 1.8, arbitrary: true }
      }
    ]
  ])('rejects %s', (_label, mutate) => {
    const state = cloneLexicalState()
    mutate(state)

    expect(() => lexicalEditorStateToRichTextDocument(state)).toThrow()
  })

  it('rejects nested lists beyond the supported depth', () => {
    const state = cloneLexicalState()
    const root = state.root as Record<string, unknown>
    const list = (root.children as Record<string, unknown>[])[1]
    const item = (list.children as Record<string, unknown>[])[0]
    item.children = [structuredClone(list)]

    expect(() => lexicalEditorStateToRichTextDocument(state)).toThrow()
  })

  it('rejects documents over the node and character limits', () => {
    const oversizedTextState = cloneLexicalState()
    firstTextNode(oversizedTextState).text = 'x'.repeat(MAX_RICH_TEXT_CHARACTERS + 1)

    const oversizedNodeState = cloneLexicalState()
    const root = oversizedNodeState.root as Record<string, unknown>
    const paragraph = (root.children as Record<string, unknown>[])[0]
    root.children = Array.from({ length: 500 }, () => structuredClone(paragraph))

    expect(() => lexicalEditorStateToRichTextDocument(oversizedTextState)).toThrow()
    expect(() => lexicalEditorStateToRichTextDocument(oversizedNodeState)).toThrow()
  })
})
