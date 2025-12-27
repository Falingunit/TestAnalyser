import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export const NotFound = () => {
  return (
    <div className="app-canvas flex min-h-screen items-center justify-center px-6">
      <Card className="app-surface w-full max-w-lg">
        <CardContent className="space-y-4 p-8 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            404
          </p>
          <h1 className="text-3xl font-semibold">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            The page you are looking for does not exist or was moved.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link to="/app">Go to dashboard</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
