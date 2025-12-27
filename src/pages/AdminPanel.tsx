import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '@/lib/store'
import { buildAnalysis, formatAnswerValue } from '@/lib/analysis'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { formatQuestionType } from '@/lib/utils'

export const AdminPanel = () => {
  const { state, updateAnswerKey } = useAppStore()
  const [message, setMessage] = useState<string | null>(null)

  const testsWithUpdates = useMemo(() => {
    return state.tests
      .map((test) => ({ test, analysis: buildAnalysis(test) }))
      .filter((entry) => entry.analysis.keyChanges.length > 0)
  }, [state.tests])

  const [resolvedTestId, setResolvedTestId] = useState(
    testsWithUpdates[0]?.test.id ?? '',
  )

  useEffect(() => {
    if (!resolvedTestId && testsWithUpdates.length > 0) {
      setResolvedTestId(testsWithUpdates[0].test.id)
      return
    }
    if (
      resolvedTestId &&
      !testsWithUpdates.some((item) => item.test.id === resolvedTestId)
    ) {
      setResolvedTestId(testsWithUpdates[0]?.test.id ?? '')
    }
  }, [resolvedTestId, testsWithUpdates])

  const selected = testsWithUpdates.find((item) => item.test.id === resolvedTestId)

  const handleKeyUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) {
      return
    }
    const data = new FormData(event.currentTarget)
    const questionId = String(data.get('questionId') ?? '')
    const newKey = data.get('newKey')
    const isBonus = data.get('bonus') === 'on'
    if (!questionId || (!newKey && !isBonus)) {
      setMessage('Select a question and enter a new key or mark it as bonus.')
      return
    }
    await updateAnswerKey({
      testId: selected.test.id,
      questionId,
      newKey: isBonus ? { bonus: true } : newKey,
    })
    setMessage('Key update saved.')
    event.currentTarget.reset()
  }

  return (
    <div className="space-y-6">
      <section className="app-surface space-y-4 p-8">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app">Back to dashboard</Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Admin
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Key update queue</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Review tests with updated answer keys and push corrections.
            </p>
          </div>
          <Badge variant={testsWithUpdates.length ? 'secondary' : 'outline'}>
            {testsWithUpdates.length} tests with updates
          </Badge>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="app-panel">
          <CardContent className="space-y-4 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Test selection
            </p>
            <Select value={resolvedTestId} onValueChange={setResolvedTestId}>
              <SelectTrigger>
                <SelectValue placeholder="Select test" />
              </SelectTrigger>
              <SelectContent>
                {testsWithUpdates.map((item) => (
                  <SelectItem key={item.test.id} value={item.test.id}>
                    {item.test.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected ? (
              <div className="space-y-2 rounded-lg border border-border bg-background p-4 text-sm">
                <p className="font-medium text-foreground">{selected.test.title}</p>
                <p className="text-xs text-muted-foreground">
                  {selected.analysis.keyChanges.length} questions updated
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/app/tests/${selected.test.id}`}>Open test</Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No key updates waiting.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="app-panel">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Update answers
              </p>
              {selected ? (
                <Badge variant="destructive">{selected.analysis.keyChanges.length} updates</Badge>
              ) : null}
            </div>
            <Separator />
            {selected ? (
              <div className="space-y-4">
                {selected.analysis.keyChanges.map((question) => (
                  <form
                    key={question.id}
                    className="rounded-lg border border-border bg-background p-4"
                    onSubmit={handleKeyUpdate}
                  >
                    <input type="hidden" name="questionId" value={question.id} />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Q{question.questionNumber} - {question.subject}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Current key {formatAnswerValue(question.keyUpdate)}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {formatQuestionType(question.qtype)}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Input name="newKey" placeholder="New key" className="max-w-[180px]" />
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input type="checkbox" name="bonus" className="h-3.5 w-3.5" />
                        Bonus question
                      </label>
                      <Button type="submit" size="sm">
                        Apply update
                      </Button>
                    </div>
                  </form>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a test to view key updates.
              </p>
            )}
            {message ? (
              <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                {message}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
