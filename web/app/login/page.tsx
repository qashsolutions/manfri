import { KeyRound, ShieldCheck } from "lucide-react";

import { signInAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            M
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Sign in to ManFriday</h1>
          <p className="text-sm text-muted-foreground">Recruiter sign-in</p>
        </div>

        <Card>
          <CardContent className="space-y-4 p-6">
            <form action={signInAction} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@agency.com" required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
              </div>

              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}

              <Button type="submit" className="w-full">
                <KeyRound className="size-4" />
                Sign in
              </Button>
            </form>

            <Separator />

            <p className="text-center text-xs text-muted-foreground">
              Recruiter accounts are managed by your organization admin.
            </p>
          </CardContent>
        </Card>

        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-success" />
          Sessions are managed by Supabase Auth
        </p>
      </div>
    </div>
  );
}
