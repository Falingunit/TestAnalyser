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
      <div className="grid min-h-screen items-center px-6 py-12">
        <div className="mx-auto w-full max-w-5xl">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <section className="space-y-4 rounded-2xl border border-border bg-card p-8 animate-in fade-in-80">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.45em] text-muted-foreground">
                  TestAnalyser
                </p>
                <h1 className="text-3xl font-semibold text-foreground">Account access</h1>
                <p className="text-sm text-muted-foreground">
                  Sign in with your credentials to continue.
                </p>
              </div>
            </section>

            <section className="flex items-center">
              <Card className="w-full animate-in fade-in-80 delay-150">
                <CardContent className="space-y-6 p-8">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                      Login
                    </p>
                    <h2 className="text-2xl font-semibold">Sign in or register</h2>
                    <p className="text-sm text-muted-foreground">
                      Choose an option to continue.
                    </p>
                  </div>

                    <Tabs value={tab} onValueChange={setTab} className="w-full">
                      <TabsList className="grid w-full grid-cols-2 rounded-full bg-muted/40 p-1">
                        <TabsTrigger value="signin" className="rounded-full">
                          Sign in
                        </TabsTrigger>
                        <TabsTrigger value="register" className="rounded-full">
                          Create account
                        </TabsTrigger>
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
                            <Input
                              id="email-register"
                              name="email"
                              type="email"
                              required
                            />
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
        </div>
    </div>
  )
}
