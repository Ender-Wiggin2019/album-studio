import * as React from 'react'
import { LoaderCircleIcon } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>): React.JSX.Element {
  return (
    <LoaderCircleIcon
      data-slot="spinner"
      role="status"
      aria-label="加载中"
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  )
}

export { Spinner }
