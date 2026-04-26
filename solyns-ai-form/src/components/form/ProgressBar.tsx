import { cn } from '@/lib/utils'

interface ProgressBarProps {
  progress: number
  className?: string
}

export function ProgressBar({ progress, className }: ProgressBarProps) {
  return (
    <div className={cn('h-1 w-full bg-muted', className)}>
      <div
        className="h-full bg-primary transition-all duration-500 ease-out"
        style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
      />
    </div>
  )
}
