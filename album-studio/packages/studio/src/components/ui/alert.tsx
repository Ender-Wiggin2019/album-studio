import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/shared/lib/cn'

const alertVariants = cva(
  'relative grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 rounded-md border px-3 py-2.5 text-sm [&>svg]:mt-0.5 [&>svg]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground',
        destructive:
          'border-destructive/35 bg-destructive/8 text-destructive [&_[data-slot=alert-description]]:text-destructive/85'
      }
    },
    defaultVariants: { variant: 'default' }
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>): React.JSX.Element {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="alert-title"
      className={cn('col-start-2 font-medium leading-5', className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 text-xs leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  )
}

export { Alert, AlertDescription, AlertTitle }
