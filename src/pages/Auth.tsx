import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const Auth = () => {
  const { currentUser, login, register } = useAppStore()
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [tab, setTab] = useState('signin')

  if (currentUser) {
    return <Navigate to="/app" replace />
  }

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setAuthMessage(null)

    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')

    const result = await login({ email, password })
    if (!result.ok) {
      setAuthMessage(result.message ?? 'Unable to sign in.')
    }
    setIsSubmitting(false)
  }

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setAuthMessage(null)

    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '')
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')

    const result = await register({ name, email, password })
    if (!result.ok) {
      setAuthMessage(result.message ?? 'Unable to create account.')
    }
    setIsSubmitting(false)
  }

  return (
    <div className="app-canvas">
      <div className="grid min-h-screen gap-6 px-6 py-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-10">
        <section className="flex flex-col gap-6">
          <div className="app-surface flex flex-col gap-4 p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              TestAnalyser
            </p>
            <h1 className="text-3xl font-semibold">
              Your command center for test diagnostics.
            </h1>
            <p className="text-sm text-muted-foreground">
              Track each attempt, verify key updates, and build a sharper revision plan.
            </p>
          </div>
        </section>

        <section className="flex items-center">
          <Card className="app-surface w-full">
            <CardContent className="space-y-6 p-8">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  Access
                </p>
                <h2 className="mt-2 text-2xl font-semibold">Secure your session</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Use your existing account or create a new one in seconds.
                </p>
              </div>

              <Tabs value={tab} onValueChange={setTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="register">Create account</TabsTrigger>
                </TabsList>
                <TabsContent value="signin" className="pt-4">
                  <form className="space-y-4" onSubmit={handleLogin}>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" name="email" type="email" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input id="password" name="password" type="password" required />
                    </div>
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? 'Signing in...' : 'Sign in'}
                    </Button>
                  </form>
                </TabsContent>
                <TabsContent value="register" className="pt-4">
                  <form className="space-y-4" onSubmit={handleRegister}>
                    <div className="space-y-2">
                      <Label htmlFor="name">Full name</Label>
                      <Input id="name" name="name" type="text" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email-register">Email</Label>
                      <Input id="email-register" name="email" type="email" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password-register">Password</Label>
                      <Input
                        id="password-register"
                        name="password"
                        type="password"
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? 'Creating account...' : 'Create account'}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>

              {authMessage ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {authMessage}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}
