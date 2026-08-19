import * as React from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from './button'

function InputGroup({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="input-group"
      className={cn(
        'flex h-9 w-full min-w-0 items-center rounded-md border border-input bg-transparent shadow-xs transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25',
        className
      )}
      {...props}
    />
  )
}

function InputGroupAddon({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="input-group-addon"
      className={cn(
        'flex shrink-0 items-center px-2.5 text-muted-foreground [&_svg:not([class*=size-])]:size-4',
        className
      )}
      {...props}
    />
  )
}

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<'input'>): React.JSX.Element {
  return (
    <input
      data-slot="input-group-control"
      className={cn(
        'h-full min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

function InputGroupButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>): React.JSX.Element {
  return (
    <Button
      data-slot="input-group-button"
      variant="ghost"
      size="icon-sm"
      className={cn('mr-0.5 size-7', className)}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput }
