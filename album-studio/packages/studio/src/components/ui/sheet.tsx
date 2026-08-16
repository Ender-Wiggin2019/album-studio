import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close

function SheetContent({
  className,
  children,
  side = 'right',
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'left' | 'right'
}): React.JSX.Element {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45" />
      <SheetPrimitive.Content
        className={cn(
          'fixed inset-y-0 z-50 flex w-[min(88vw,380px)] flex-col border bg-background shadow-2xl outline-none',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
          className
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close
          className="absolute right-4 top-4 rounded-sm p-1 text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="关闭"
        >
          <XIcon data-icon="inline-start" />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div className={cn('grid shrink-0 gap-1.5 border-b px-5 py-5 pr-14', className)} {...props} />
  )
}
function SheetBody({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-5', className)} {...props} />
}
function SheetFooter({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      className={cn('flex shrink-0 justify-end gap-2 border-t px-5 py-4', className)}
      {...props}
    />
  )
}
function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>): React.JSX.Element {
  return <SheetPrimitive.Title className={cn('text-base font-semibold', className)} {...props} />
}
function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>): React.JSX.Element {
  return (
    <SheetPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
}
