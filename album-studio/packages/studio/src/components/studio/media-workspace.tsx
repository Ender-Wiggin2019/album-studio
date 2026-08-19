import * as React from 'react'
import { cn } from '@/shared/lib/cn'

function MediaWorkspace({
  className,
  ...props
}: React.ComponentProps<'section'>): React.JSX.Element {
  return (
    <section
      data-slot="media-workspace"
      className={cn('flex min-h-0 flex-1 flex-col bg-background text-foreground', className)}
      {...props}
    />
  )
}

function MediaWorkspaceHeader({
  className,
  ...props
}: React.ComponentProps<'header'>): React.JSX.Element {
  return (
    <header
      data-slot="media-workspace-header"
      className={cn(
        'flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-4',
        className
      )}
      {...props}
    />
  )
}

function MediaWorkspaceIdentity({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return <div className={cn('min-w-0', className)} {...props} />
}

function MediaWorkspaceTitle({
  className,
  ...props
}: React.ComponentProps<'p'>): React.JSX.Element {
  return <p className={cn('truncate text-sm font-medium', className)} {...props} />
}

function MediaWorkspaceDescription({
  className,
  ...props
}: React.ComponentProps<'p'>): React.JSX.Element {
  return <p className={cn('mt-0.5 truncate text-xs text-muted-foreground', className)} {...props} />
}

function MediaWorkspaceActions({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return <div className={cn('flex shrink-0 items-center gap-2', className)} {...props} />
}

function MediaWorkspaceBody({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return <div className={cn('grid min-h-0 flex-1', className)} {...props} />
}

function MediaWorkspaceStage({
  className,
  ...props
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="media-workspace-stage"
      className={cn(
        'relative min-h-0 overflow-hidden bg-media-stage text-media-stage-foreground',
        className
      )}
      {...props}
    />
  )
}

function MediaWorkspacePanel({
  className,
  ...props
}: React.ComponentProps<'aside'>): React.JSX.Element {
  return (
    <aside
      data-slot="media-workspace-panel"
      className={cn(
        'min-h-0 overflow-y-auto border-t bg-background p-4 lg:border-l lg:border-t-0',
        className
      )}
      {...props}
    />
  )
}

export {
  MediaWorkspace,
  MediaWorkspaceActions,
  MediaWorkspaceBody,
  MediaWorkspaceDescription,
  MediaWorkspaceHeader,
  MediaWorkspaceIdentity,
  MediaWorkspacePanel,
  MediaWorkspaceStage,
  MediaWorkspaceTitle
}
