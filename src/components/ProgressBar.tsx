import { cn } from '@/lib/utils'

type ProgressBarProps = {
  value: number
  className?: string
  indicatorClassName?: string
}

export const ProgressBar = ({ value, className, indicatorClassName }: ProgressBarProps) => {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn('h-full rounded-full bg-primary transition-all', indicatorClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
