import { describe, expect, it } from 'vitest'
import { shouldIgnoreStudioShortcut } from './studio-keyboard'

describe('shouldIgnoreStudioShortcut', () => {
  it('独占工作区和已经被当前表面消费的按键不会穿透到画布', () => {
    expect(
      shouldIgnoreStudioShortcut({
        defaultPrevented: false,
        isComposing: false,
        target: document.body,
        exclusiveWorkspace: 'preview'
      })
    ).toBe(true)
    expect(
      shouldIgnoreStudioShortcut({
        defaultPrevented: true,
        isComposing: false,
        target: document.body,
        exclusiveWorkspace: null
      })
    ).toBe(true)
  })

  it.each(['button', 'input', 'textarea', 'select'])('%s 内的按键不会操作画布', (tag) => {
    const target = document.createElement(tag)
    expect(
      shouldIgnoreStudioShortcut({
        defaultPrevented: false,
        isComposing: false,
        target,
        exclusiveWorkspace: null
      })
    ).toBe(true)
  })

  it('Dialog、富文本和拖拽手柄中的按键不会操作画布', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const dialogChild = document.createElement('span')
    dialog.append(dialogChild)

    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')

    const handle = document.createElement('div')
    handle.dataset.dndHandle = ''

    for (const target of [dialogChild, editor, handle]) {
      expect(
        shouldIgnoreStudioShortcut({
          defaultPrevented: false,
          isComposing: false,
          target,
          exclusiveWorkspace: null
        })
      ).toBe(true)
    }
  })

  it('画布空白接收未被消费的快捷键', () => {
    const target = document.createElement('div')
    expect(
      shouldIgnoreStudioShortcut({
        defaultPrevented: false,
        isComposing: false,
        target,
        exclusiveWorkspace: null
      })
    ).toBe(false)
  })
})
