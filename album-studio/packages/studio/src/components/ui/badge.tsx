import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/shared/lib/cn'

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-white',
        outline: 'text-foreground'
      }
    },
    defaultVariants: { variant: 'default' }
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>): React.JSX.Element {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge }
