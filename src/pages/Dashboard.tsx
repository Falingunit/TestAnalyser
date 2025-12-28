import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '@/lib/store'
import { buildAnalysis } from '@/lib/analysis'
import { TestSummaryCard } from '@/components/TestSummaryCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export const Dashboard = () => {
  const { currentUser, state, syncExternalAccount, acknowledgeKeyUpdates } =
    useAppStore()
  const sortedTests = useMemo(
    () =>
      [...state.tests].sort(
        (a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime(),
      ),
    [state.tests],
  )

  const analysisMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof buildAnalysis>>()
    state.tests.forEach((test) => {
      map.set(test.id, buildAnalysis(test))
    })
    return map
  }, [state.tests])

  const latestTest = sortedTests[0]
  const latestAnalysis = latestTest ? analysisMap.get(latestTest.id) : null
  const account = state.externalAccounts.find(
    (item) => item.userId === currentUser?.id,
  )
  const acknowledgedAt = latestTest
    ? currentUser?.preferences.acknowledgedKeyUpdates[latestTest.id]
    : null
  const hasNewKeyUpdates = Boolean(
    latestAnalysis?.latestKeyUpdate &&
      (!acknowledgedAt || acknowledgedAt < latestAnalysis.latestKeyUpdate),
  )

  return (
    <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="mt-2 text-3xl font-semibold">
              Welcome back, {currentUser?.name ?? 'chigga'}.
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={account ? 'secondary' : 'outline'}>
              {account ? `${account.provider} - ${account.status}` : 'No account connected'}
            </Badge>
            {account ? (
              <Button
                variant="outline"
                onClick={syncExternalAccount}
                disabled={account.syncStatus === 'syncing'}
              >
                {account.syncStatus === 'syncing' ? 'Syncing...' : 'Sync latest'}
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <Link to="/app/profile?connect=1">Connect account</Link>
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Latest test overview
          </p>
          {latestTest && latestAnalysis ? (
            <TestSummaryCard
              test={latestTest}
              analysis={latestAnalysis}
              defaultExpanded
              actions={
                <>
                  <Button asChild variant="secondary" size="sm">
                    <Link to={`/app/tests/${latestTest.id}`}>Open review</Link>
                  </Button>
                  {hasNewKeyUpdates ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => acknowledgeKeyUpdates(latestTest.id)}
                    >
                      Mark key updates reviewed
                    </Button>
                  ) : null}
                </>
              }
            />
          ) : (
            <Card className="app-panel">
              <CardContent className="space-y-3 p-6">
                <p className="text-sm text-muted-foreground">
                  No tests found yet. Connect your exam account and start syncing.
                </p>
                {account ? (
                  <Button onClick={syncExternalAccount} disabled={account.syncStatus === 'syncing'}>
                    {account.syncStatus === 'syncing' ? 'Syncing...' : 'Sync latest'}
                  </Button>
                ) : (
                  <Button asChild>
                    <Link to="/app/profile?connect=1">Connect account</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>

      <section className="">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Recent tests
            </p>
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/tests">Show all</Link>
            </Button>
          </div>
          <div className="space-y-4">
            {sortedTests.slice(0, 5).map((test) => {
              const summary = analysisMap.get(test.id)
              return (
                <TestSummaryCard
                  key={test.id}
                  test={test}
                  analysis={summary}
                  actions={
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/app/tests/${test.id}`}>Open review</Link>
                    </Button>
                  }
                />
              )
            })}
            {sortedTests.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Your recent tests will appear here once synced.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}
