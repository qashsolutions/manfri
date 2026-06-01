import { KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function LoginPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-muted/30 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            M
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Sign in to ManFriday</h1>
          <p className="text-sm text-muted-foreground">Compliant talent CRM for recruiters</p>
        </div>

        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" type="email" placeholder="you@agency.com" />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <span className="text-xs text-muted-foreground transition-colors hover:text-foreground">
                  Forgot?
                </span>
              </div>
              <Input id="password" type="password" placeholder="••••••••" />
            </div>

            <div className="space-y-1.5">
              <Label>Authenticator code</Label>
              <div className="flex gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Input
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static mockup
                    key={i}
                    inputMode="numeric"
                    maxLength={1}
                    className="size-10 px-0 text-center text-base"
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">6-digit code from your authenticator app</p>
            </div>

            <Button className="w-full" asChild>
              <Link href="/">
                <KeyRound className="size-4" />
                Sign in
              </Link>
            </Button>

            <Separator />

            <p className="text-center text-xs text-muted-foreground">
              Candidates sign in with a one-time magic link instead.
            </p>
          </CardContent>
        </Card>

        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-success" />
          Two-factor required · sessions are short-lived and audited
        </p>
      </div>
    </div>
  );
}
