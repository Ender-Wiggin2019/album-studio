import * as React from 'react'
import { cn } from '@/shared/lib/cn'

function Empty({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="empty"
      className={cn(
        'flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-10 text-center',
        className
      )}
      {...props}
    />
  )
}

function EmptyMedia({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="empty-media"
      className={cn(
        'mb-3 flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg:not([class*=size-])]:size-5',
        className
      )}
      {...props}
    />
  )
}

function EmptyTitle({ className, ...props }: React.ComponentProps<'h2'>): React.JSX.Element {
  return (
    <h2
      data-slot="empty-title"
      className={cn('text-sm font-semibold text-foreground', className)}
      {...props}
    />
  )
}

function EmptyDescription({ className, ...props }: React.ComponentProps<'p'>): React.JSX.Element {
  return (
    <p
      data-slot="empty-description"
      className={cn('mt-1.5 max-w-sm text-xs leading-5 text-muted-foreground', className)}
      {...props}
    />
  )
}

function EmptyContent({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="empty-content" className={cn('mt-4', className)} {...props} />
}

export { Empty, EmptyContent, EmptyDescription, EmptyMedia, EmptyTitle }
