import * as React from 'react'
import { cn } from '@/lib/utils'

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<'div'> & { value?: number }): React.JSX.Element {
  const normalized = value === undefined ? null : Math.min(100, Math.max(0, value))
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalized ?? undefined}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-primary/20', className)}
      {...props}
    >
      <div
        className={cn(
          'h-full bg-primary transition-transform',
          normalized === null && 'w-full animate-pulse'
        )}
        style={normalized === null ? undefined : { transform: `translateX(-${100 - normalized}%)` }}
      />
    </div>
  )
}

export { Progress }
