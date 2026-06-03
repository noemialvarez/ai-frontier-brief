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

function AuthPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  // If already signed in, bounce home.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

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
      toast.success("Check your inbox", { description: `We sent a sign-in link to ${email}.` });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send link");
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
            Sign in with a magic link to manage your sources and keep your saves private.
            Without signing in you can still read the default feed.
          </p>

          {sent ? (
            <div className="mt-6 rounded-md border border-brand-turquoise/40 bg-brand-turquoise/5 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <Mail className="h-4 w-4" /> Check your email
              </div>
              <p className="mt-1 text-muted-foreground">
                We sent a link to <span className="font-medium text-foreground">{email}</span>. Click it
                to finish signing in.
              </p>
              <Button variant="ghost" className="mt-3" onClick={() => setSent(false)}>
                Use a different email
              </Button>
            </div>
          ) : (
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
                Send magic link
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
