import { cn } from '@/lib/utils'

type Segment = {
  value: number
  className: string
}

type SegmentedProgressBarProps = {
  segments: Segment[]
  className?: string
}

export const SegmentedProgressBar = ({
  segments,
  className,
}: SegmentedProgressBarProps) => {
  const total = segments.reduce(
    (sum, segment) => sum + Math.max(0, segment.value),
    0,
  )

  return (
    <div className={cn('flex h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      {segments.map((segment, index) => {
        const safeValue = Math.max(0, segment.value)
        const width = total > 0 ? (safeValue / total) * 100 : 0
        return (
          <div
            key={`${segment.className}-${index}`}
            className={cn('h-full transition-all', segment.className)}
            style={{ width: `${width}%` }}
          >
          </div>
        )
      })}
    </div>
  )
}
