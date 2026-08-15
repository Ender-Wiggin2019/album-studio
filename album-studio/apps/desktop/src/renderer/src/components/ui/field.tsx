import * as React from 'react'
import { cn } from '@/lib/utils'

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="field-group" className={cn('grid gap-4', className)} {...props} />
}

function Field({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="field" className={cn('grid gap-1.5', className)} {...props} />
}

function FieldLabel({ className, ...props }: React.ComponentProps<'label'>): React.JSX.Element {
  return (
    <label
      data-slot="field-label"
      className={cn('text-sm font-medium leading-none', className)}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>): React.JSX.Element {
  return (
    <p
      data-slot="field-description"
      className={cn('text-xs leading-relaxed text-muted-foreground', className)}
      {...props}
    />
  )
}

function FieldError({ className, ...props }: React.ComponentProps<'p'>): React.JSX.Element {
  return (
    <p
      data-slot="field-error"
      role="alert"
      className={cn('text-xs text-destructive', className)}
      {...props}
    />
  )
}

function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>): React.JSX.Element {
  return <fieldset data-slot="field-set" className={cn('grid gap-3', className)} {...props} />
}

function FieldLegend({ className, ...props }: React.ComponentProps<'legend'>): React.JSX.Element {
  return (
    <legend
      data-slot="field-legend"
      className={cn('mb-2 text-sm font-semibold', className)}
      {...props}
    />
  )
}

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet }
