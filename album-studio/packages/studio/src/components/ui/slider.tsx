import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/shared/lib/cn'

function Slider({
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>): React.JSX.Element {
  const values = props.value ?? props.defaultValue ?? [0]
  return (
    <SliderPrimitive.Root
      className={cn(
        'relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/18">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {values.map((_, index) => (
        <SliderPrimitive.Thumb
          key={index}
          aria-label={ariaLabel && values.length > 1 ? `${ariaLabel} ${index + 1}` : ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          className="block size-4 rounded-full border-2 border-primary bg-background shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
