import type { RichTextDocument } from '@album-studio/common'
import { ListItemNode, ListNode } from '@lexical/list'
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin'
import { LexicalComposer, type InitialConfigType } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import {
  $getNodeByKey,
  $getSelection,
  $getState,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  DROP_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  INSERT_TAB_COMMAND,
  PASTE_COMMAND,
  ParagraphNode,
  mergeRegister,
  type EditorState,
  type EditorThemeClasses,
  type LexicalEditor,
  type MutationListener
} from 'lexical'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  albumLineHeightState,
  lexicalEditorStateToRichTextDocument,
  richTextDocumentToLexicalEditorState
} from './lexical-adapter'
import { RichTextToolbar } from './rich-text-toolbar'

const EXTERNAL_DOCUMENT_TAG = 'album-rich-text-external-document'

const EDITOR_THEME: EditorThemeClasses = {
  paragraph: 'm-0 min-h-6',
  list: {
    listitem: 'my-0.5',
    ol: 'my-0 list-decimal pl-6',
    ul: 'my-0 list-disc pl-6'
  },
  text: {
    bold: 'font-bold',
    italic: 'italic',
    underline: 'underline'
  }
}

export type RichTextEditorProps = Readonly<{
  document: RichTextDocument
  onChange: (document: RichTextDocument) => void
  onBlur?: () => void
  autoFocus?: boolean
}>

function handleLexicalError(error: Error): never {
  throw error
}

function VerifiedOnChangePlugin({
  onChange
}: Pick<RichTextEditorProps, 'onChange'>): React.JSX.Element {
  const handleChange = useCallback(
    (editorState: EditorState, _editor: LexicalEditor, tags: Set<string>): void => {
      if (tags.has(EXTERNAL_DOCUMENT_TAG)) return
      onChange(lexicalEditorStateToRichTextDocument(editorState.toJSON()))
    },
    [onChange]
  )

  return (
    <OnChangePlugin
      ignoreHistoryMergeTagChange={false}
      ignoreSelectionChange
      onChange={handleChange}
    />
  )
}

function DocumentSyncPlugin({ document }: Pick<RichTextEditorProps, 'document'>): null {
  const [editor] = useLexicalComposerContext()
  const serialized = useMemo(() => {
    const editorState = richTextDocumentToLexicalEditorState(document)
    return {
      document: JSON.stringify(lexicalEditorStateToRichTextDocument(editorState)),
      editorState: JSON.stringify(editorState)
    }
  }, [document])

  useEffect(() => {
    let currentDocument: string | null = null
    try {
      currentDocument = JSON.stringify(
        lexicalEditorStateToRichTextDocument(editor.getEditorState().toJSON())
      )
    } catch {
      // A strict external value is allowed to recover a locally invalid transient state.
    }
    if (currentDocument === serialized.document) return

    editor.setEditorState(editor.parseEditorState(serialized.editorState), {
      tag: EXTERNAL_DOCUMENT_TAG
    })
  }, [editor, serialized])

  return null
}

function RestrictedInputPlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          PASTE_COMMAND,
          (event) => {
            const dataTransfer =
              (event as ClipboardEvent).clipboardData ?? (event as InputEvent).dataTransfer
            if (dataTransfer === null || dataTransfer === undefined) return false

            const selection = $getSelection()
            if (!$isRangeSelection(selection)) return false
            event.preventDefault()
            const lines = dataTransfer
              .getData('text/plain')
              .replace(/\r\n?/g, '\n')
              .replace(/\t/g, '  ')
              .split('\n')
            selection.insertText(lines[0] ?? '')
            for (const line of lines.slice(1)) {
              selection.insertParagraph()
              selection.insertText(line)
            }
            return true
          },
          COMMAND_PRIORITY_HIGH
        ),
        editor.registerCommand(
          DROP_COMMAND,
          (event) => {
            event.preventDefault()
            return true
          },
          COMMAND_PRIORITY_HIGH
        ),
        editor.registerCommand(
          FORMAT_TEXT_COMMAND,
          (format) => format !== 'bold' && format !== 'italic' && format !== 'underline',
          COMMAND_PRIORITY_HIGH
        ),
        editor.registerCommand(
          INSERT_LINE_BREAK_COMMAND,
          () => {
            const selection = $getSelection()
            if (!$isRangeSelection(selection)) return false
            selection.insertParagraph()
            return true
          },
          COMMAND_PRIORITY_HIGH
        ),
        editor.registerCommand(
          INSERT_TAB_COMMAND,
          () => {
            const selection = $getSelection()
            if (!$isRangeSelection(selection)) return false
            selection.insertText('  ')
            return true
          },
          COMMAND_PRIORITY_HIGH
        ),
        editor.registerCommand(INDENT_CONTENT_COMMAND, () => true, COMMAND_PRIORITY_HIGH)
      ),
    [editor]
  )

  return null
}

function LineHeightDomPlugin(): null {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const syncLineHeight: MutationListener = (mutations) => {
      editor.getEditorState().read(() => {
        for (const [key, mutation] of mutations) {
          if (mutation === 'destroyed') continue
          const node = $getNodeByKey(key)
          if (!$isParagraphNode(node) && !(node instanceof ListNode)) continue
          const element = editor.getElementByKey(key)
          if (element !== null) {
            element.style.lineHeight = String($getState(node, albumLineHeightState))
          }
        }
      })
    }

    return mergeRegister(
      editor.registerMutationListener(ParagraphNode, syncLineHeight),
      editor.registerMutationListener(ListNode, syncLineHeight)
    )
  }, [editor])

  return null
}

export function RichTextEditor({
  document,
  onChange,
  onBlur,
  autoFocus = false
}: RichTextEditorProps): React.JSX.Element {
  const [initialConfig] = useState<InitialConfigType>(() => ({
    namespace: 'AlbumRichTextEditor',
    editorState: JSON.stringify(richTextDocumentToLexicalEditorState(document)),
    nodes: [ListNode, ListItemNode],
    onError: handleLexicalError,
    theme: EDITOR_THEME
  }))

  const handleBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>): void => {
      const nextTarget = event.relatedTarget as Node | null
      if (nextTarget === null || !event.currentTarget.contains(nextTarget)) onBlur?.()
    },
    [onBlur]
  )

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="flex flex-col gap-2" onBlur={handleBlur}>
        <RichTextToolbar />
        <div className="relative overflow-hidden rounded-lg border bg-background shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-label="富文本内容"
                aria-multiline="true"
                className="min-h-32 px-3 py-2.5 text-sm leading-relaxed outline-none"
                spellCheck
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
            placeholder={
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground"
              >
                输入文字…
              </div>
            }
          />
        </div>
        <HistoryPlugin delay={600} />
        <ListPlugin hasStrictIndent />
        <RestrictedInputPlugin />
        <LineHeightDomPlugin />
        <DocumentSyncPlugin document={document} />
        <VerifiedOnChangePlugin onChange={onChange} />
        {autoFocus ? <AutoFocusPlugin defaultSelection="rootEnd" /> : null}
      </div>
    </LexicalComposer>
  )
}

export default RichTextEditor
