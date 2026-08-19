import type { ExclusiveWorkspace } from '@/app/store'

const INTERACTIVE_TARGET_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="dialog"]',
  '[role="slider"]',
  '[role="menuitem"]',
  '[data-dnd-handle]'
].join(', ')

export function shouldIgnoreStudioShortcut(input: {
  defaultPrevented: boolean
  isComposing: boolean
  target: EventTarget | null
  exclusiveWorkspace: ExclusiveWorkspace
}): boolean {
  if (input.defaultPrevented || input.isComposing || input.exclusiveWorkspace) return true
  return input.target instanceof Element && Boolean(input.target.closest(INTERACTIVE_TARGET_SELECTOR))
}
