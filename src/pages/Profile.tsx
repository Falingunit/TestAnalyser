import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAppStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Profile = () => {
  const {
    currentUser,
    updateProfile,
    updatePassword,
    connectExternalAccount,
    state,
    adminOverride,
    setAdminOverride,
    setMode,
  } = useAppStore();
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [connectMessage, setConnectMessage] = useState<string | null>(null);
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const account = state.externalAccounts.find(
    (item) => item.userId === currentUser?.id
  );
  const mode = currentUser?.preferences.mode ?? state.ui.mode;
  const isDark = mode === "dark";

  const handleProfileSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileMessage(null);
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    const email = String(form.get("email") ?? "");
    const result = await updateProfile({ name, email });
    setProfileMessage(
      result.ok ? "Profile updated." : result.message ?? "Update failed."
    );
  };

  const handlePasswordSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordMessage(null);
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const nextPassword = String(form.get("nextPassword") ?? "");
    const result = await updatePassword({ currentPassword, nextPassword });
    setPasswordMessage(
      result.ok ? "Password updated." : result.message ?? "Update failed."
    );
    event.currentTarget.reset();
  };

  const handleConnect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setConnectMessage(null);
    setIsConnecting(true);
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "");
    const password = String(form.get("password") ?? "");
    try {
      const result = await connectExternalAccount({ username, password });
      if (result.ok) {
        setConnectMessage("Connected successfully.");
        event.currentTarget.reset();
        closeConnectDialog();
      } else {
        setConnectMessage(result.message ?? "Unable to connect account.");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const clearConnectParam = () => {
    if (searchParams.get("connect") !== "1") {
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("connect");
    setSearchParams(nextParams, { replace: true });
  };

  const closeConnectDialog = () => {
    setIsConnectOpen(false);
    clearConnectParam();
  };

  useEffect(() => {
    if (searchParams.get("connect") === "1") {
      setIsConnectOpen(true);
    }
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <section className="app-surface space-y-4 p-8">
        <Button asChild variant="ghost" size="sm">
          <Link to="/app">Back to dashboard</Link>
        </Button>
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Preferences
        </p>
        <h1 className="text-3xl font-semibold">Account settings</h1>
        <p className="text-sm text-muted-foreground">
          Update your identity and security preferences.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="app-panel">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Profile
              </p>
              <Badge variant="secondary">Signed in</Badge>
            </div>
            <form className="space-y-4" onSubmit={handleProfileSave}>
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={currentUser?.name ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={currentUser?.email ?? ""}
                />
              </div>
              <Button type="submit">Save profile</Button>
            </form>
            {profileMessage ? (
              <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                {profileMessage}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="app-panel">
          <CardContent className="space-y-4 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Security
            </p>
            <form className="space-y-4" onSubmit={handlePasswordSave}>
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nextPassword">New password</Label>
                <Input id="nextPassword" name="nextPassword" type="password" />
              </div>
              <Button type="submit">Update password</Button>
            </form>
            {passwordMessage ? (
              <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                {passwordMessage}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="app-panel">
          <CardContent className="space-y-4 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Appearance
            </p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Dark mode</p>
                <p className="text-xs text-muted-foreground">
                  Toggle between light and dark themes.
                </p>
              </div>
              <Switch
                checked={isDark}
                onCheckedChange={(checked) =>
                  setMode(checked ? "dark" : "light")
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card className="app-panel">
          <CardContent className="space-y-4 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Admin access
            </p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Enable admin privileges
                </p>
                <p className="text-xs text-muted-foreground">
                  Enable to unlock admin-only tools.
                </p>
              </div>
              <Switch
                checked={adminOverride}
                onCheckedChange={setAdminOverride}
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4">
        <Card className="app-panel">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Z7i account
              </p>
              <Badge variant={account ? "secondary" : "outline"}>
                {account
                  ? `${account.provider} - ${account.status}`
                  : "Not connected"}
              </Badge>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Z7i username</Label>
                  <Input
                    readOnly
                    value={account?.username ?? "Not connected"}
                  />
                </div>
              </div>
            </div>
            <Dialog
              open={isConnectOpen}
              onOpenChange={(nextOpen) => {
                setIsConnectOpen(nextOpen);
                if (!nextOpen) {
                  clearConnectParam();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="secondary">
                  {account ? "Change external account" : "Connect account"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Connect z7i account</DialogTitle>
                  <DialogDescription>
                    Provide the Z7i enrollment and password to sync tests.
                  </DialogDescription>
                </DialogHeader>
                <form className="space-y-4" onSubmit={handleConnect}>
                  <div className="space-y-2">
                    <Label htmlFor="username">Z7i Enrollment Number</Label>
                    <Input
                      id="username"
                      name="username"
                      placeholder="External username"
                      disabled={isConnecting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Z7i Password</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      disabled={isConnecting}
                    />
                  </div>
                  <Button type="submit" disabled={isConnecting}>
                    {isConnecting ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-background/70 border-t-transparent" />
                        Verifying...
                      </span>
                    ) : (
                      "Connect account"
                    )}
                  </Button>
                  {connectMessage ? (
                    <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                      {connectMessage}
                    </div>
                  ) : null}
                </form>
              </DialogContent>
            </Dialog>
            {connectMessage && !isConnectOpen ? (
              <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                {connectMessage}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};
