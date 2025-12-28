import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '@/lib/store'
import { buildAnalysis } from '@/lib/analysis'
import { buildDisplayQuestions } from '@/lib/questionDisplay'
import { TestSummaryCard } from '@/components/TestSummaryCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const subjects = ['ALL', 'PHYSICS', 'CHEMISTRY', 'MATHEMATICS'] as const

type SubjectFilter = (typeof subjects)[number]

type SortOption = 'date-desc' | 'date-asc' | 'score-desc' | 'score-asc'

export const Tests = () => {
  const { state, currentUser, resyncTest, resyncAllTests } = useAppStore()
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState<SubjectFilter>('ALL')
  const [sort, setSort] = useState<SortOption>('date-desc')
  const [resyncingId, setResyncingId] = useState<string | null>(null)
  const [isResyncingAll, setIsResyncingAll] = useState(false)
  const [resyncAllMessage, setResyncAllMessage] = useState<string | null>(null)
  const [confirmResyncAllOpen, setConfirmResyncAllOpen] = useState(false)
  const [confirmResyncId, setConfirmResyncId] = useState<string | null>(null)

  const account = state.externalAccounts.find(
    (item) => item.userId === currentUser?.id && item.provider === 'test.z7i.in',
  )
  const isSyncing = account?.syncStatus === 'syncing'
  const canResyncAll = Boolean(account && !isSyncing && state.tests.length > 0)

  const analysisMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildAnalysis>>()
    state.tests.forEach((test) => {
      map.set(test.id, buildAnalysis(test))
    })
    return map
  }, [state.tests])
  const questionOrderMap = useMemo(() => {
    const map = new Map<string, string>()
    state.tests.forEach((test) => {
      const first = buildDisplayQuestions(test.questions)[0]
      map.set(test.id, first?.question.id ?? '')
    })
    return map
  }, [state.tests])

  const visibleTests = useMemo(() => {
    const filtered = state.tests.filter((test) => {
      const inQuery =
        query.trim().length === 0 ||
        test.title.toLowerCase().includes(query.trim().toLowerCase())
      const inSubject =
        subject === 'ALL' ||
        test.questions.some((question) => question.subject === subject)
      return inQuery && inSubject
    })

    const sorted = [...filtered].sort((a, b) => {
      const analysisA = analysisMap.get(a.id)
      const analysisB = analysisMap.get(b.id)
      switch (sort) {
        case 'date-asc':
          return new Date(a.examDate).getTime() - new Date(b.examDate).getTime()
        case 'score-desc':
          return (analysisB?.scoreCurrent ?? 0) - (analysisA?.scoreCurrent ?? 0)
        case 'score-asc':
          return (analysisA?.scoreCurrent ?? 0) - (analysisB?.scoreCurrent ?? 0)
        case 'date-desc':
        default:
          return new Date(b.examDate).getTime() - new Date(a.examDate).getTime()
      }
    })

    return sorted
  }, [analysisMap, query, sort, state.tests, subject])

  return (
    <div className="space-y-6">
      <section className="app-surface space-y-6 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Test library
            </p>
            <h1 className="mt-2 text-3xl font-semibold">All attempts</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Filter, compare, and open each test with a single click.
            </p>
          </div>
          <Button
            type="button"
            disabled={!canResyncAll || isResyncingAll}
            onClick={async () => {
              if (!canResyncAll || isResyncingAll) {
                return
              }
              setConfirmResyncAllOpen(true)
            }}
          >
            {isResyncingAll ? 'Resyncing all...' : 'Resync all tests'}
          </Button>
        </div>
        {resyncAllMessage ? (
          <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
            {resyncAllMessage}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
          <Card className="app-panel">
            <CardContent className="space-y-4 p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Filters
              </p>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Search</label>
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by test name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Subject</label>
                <Select value={subject} onValueChange={(value) => setSubject(value as SubjectFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All subjects" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Sort by</label>
                <Select value={sort} onValueChange={(value) => setSort(value as SortOption)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date-desc">Newest first</SelectItem>
                    <SelectItem value="date-asc">Oldest first</SelectItem>
                    <SelectItem value="score-desc">Highest score</SelectItem>
                    <SelectItem value="score-asc">Lowest score</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {visibleTests.map((test) => {
              const analysis = analysisMap.get(test.id)
              const canResync = Boolean(test.externalExamId && account && !isSyncing)
              const firstQuestionId = questionOrderMap.get(test.id) ?? ''
              return (
                <TestSummaryCard
                  key={test.id}
                  test={test}
                  analysis={analysis}
                  actions={
                    <>
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/app/tests/${test.id}`}>Open review</Link>
                      </Button>
                      <Button asChild size="sm">
                        <Link to={`/app/questions/${test.id}/${firstQuestionId}`}>
                          Open questions
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!canResync || resyncingId === test.id}
                        onClick={() => {
                          if (!canResync) {
                            return
                          }
                          setConfirmResyncId(test.id)
                        }}
                      >
                        {resyncingId === test.id ? 'Resyncing...' : 'Resync exam'}
                      </Button>
                    </>
                  }
                />
              )
            })}
            {visibleTests.length === 0 ? (
              <Card className="app-panel">
                <CardContent className="space-y-2 p-6">
                  <p className="text-sm text-muted-foreground">
                    No tests match the current filters.
                  </p>
                  <Button onClick={() => setQuery('')} variant="outline">
                    Clear search
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </section>

      <Dialog open={confirmResyncAllOpen} onOpenChange={setConfirmResyncAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resync all tests?</DialogTitle>
            <DialogDescription>
              This will replace your current attempts with the latest data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmResyncAllOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setConfirmResyncAllOpen(false)
                setResyncAllMessage(null)
                setIsResyncingAll(true)
                const result = await resyncAllTests()
                setIsResyncingAll(false)
                setResyncAllMessage(
                  result.ok
                    ? 'Resync started. Your tests will refresh shortly.'
                    : result.message ?? 'Resync failed.',
                )
              }}
            >
              Resync all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmResyncId)}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmResyncId(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resync this exam?</DialogTitle>
            <DialogDescription>
              This will replace your current attempt for this exam.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmResyncId(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!confirmResyncId) {
                  return
                }
                const targetId = confirmResyncId
                setConfirmResyncId(null)
                setResyncingId(targetId)
                await resyncTest(targetId)
                setResyncingId(null)
              }}
            >
              Resync exam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
