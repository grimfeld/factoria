import { useState, type FormEvent } from "react";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      // PocketBase ClientResponseError: status 400 = bad creds; status 0 =
      // could not reach the backend at all (wrong URL / no network).
      const status = (err as { status?: number })?.status;
      if (status === 0 || status === undefined) {
        setError(
          `Cannot reach the backend at ${import.meta.env.VITE_POCKETBASE_URL}. Check the server URL and your connection.`,
        );
      } else if (status === 400) {
        setError("Invalid email or password.");
      } else {
        const msg = (err as { message?: string })?.message ?? String(err);
        setError(`Login failed (${status}): ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl text-primary">Factoria</CardTitle>
          <CardDescription>Sign in to your library.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Signup is closed — accounts are created by the administrator.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
