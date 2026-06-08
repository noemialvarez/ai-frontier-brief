import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — The AI Frontier Brief" },
      { name: "description", content: "Sign in with a magic link to manage your sources and saved articles." },
    ],
  }),
  component: AuthPage,
});

const STAY_KEY = "afb_stay_signed_in";

function AuthPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [staySignedIn, setStaySignedIn] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const v = window.localStorage.getItem(STAY_KEY);
      if (v === "false") setStaySignedIn(false);
    }
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const persistStayPreference = (value: boolean) => {
    setStaySignedIn(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STAY_KEY, value ? "true" : "false");
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
          shouldCreateUser: true,
        },
      });
      if (error) throw error;
      setSent(true);
      toast.success("Check your inbox", { description: `We sent an email to ${email}.` });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
      if (error) throw error;
      toast.success("Signed in");
      navigate({ to: "/", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Invalid code");
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <h1 className="text-3xl font-bold tracking-tight text-gradient-brand">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to manage your sources and keep your saves private.
            Without signing in you can still read the default feed.
          </p>

          {!sent ? (
            <form onSubmit={send} className="mt-6 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <Button
                type="submit"
                disabled={busy || !email}
                className="w-full bg-gradient-brand text-white"
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                Send sign-in email
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className="mt-6 space-y-3">
              <div className="rounded-md border border-brand-turquoise/40 bg-brand-turquoise/5 p-4 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <Mail className="h-4 w-4" /> Check your email
                </div>
                <p className="mt-1 text-muted-foreground">
                  We've sent an email to <span className="font-medium text-foreground">{email}</span>.
                  Click the magic link or enter the code below:
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code">One-time code</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  required
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                />
              </div>
              <Button
                type="submit"
                disabled={busy || code.length < 6}
                className="w-full bg-gradient-brand text-white"
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Verify code"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => { setSent(false); setCode(""); }}
              >
                Use a different email
              </Button>
            </form>
          )}

          <div className="mt-6 text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:underline">
              ← Back to the brief
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
