import { Card, CardContent } from '@/components/ui/card'

type StatCardProps = {
  label: string
  value: string
  hint?: string
}

export const StatCard = ({ label, value, hint }: StatCardProps) => {
  return (
    <Card className="app-panel">
      <CardContent className="space-y-3 p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
          {label}
        </p>
        <div className="flex items-end justify-between gap-3">
          <p className="text-3xl font-semibold text-foreground">{value}</p>
          {hint ? (
            <p className="text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
