import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { subscribeToNewsletter } from "@/lib/newsletter.functions";

export function NewsletterSignup() {
  const subscribeFn = useServerFn(subscribeToNewsletter);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      toast.error("Please accept the terms to subscribe.");
      return;
    }
    setBusy(true);
    try {
      const r = await subscribeFn({ data: { email, gdpr_consent: true } });
      if (r.status === "already_subscribed") {
        toast.message("You're already subscribed.");
      } else if (r.status === "resubscribed") {
        toast.success("Welcome back — you're subscribed again.");
      } else {
        toast.success("Subscribed! You'll get tomorrow's brief at 07:30.");
      }
      setEmail("");
      setConsent(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not subscribe");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mt-6 rounded-xl border-2 border-brand-turquoise/40 bg-brand-turquoise/5 p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px] space-y-1.5">
          <Label htmlFor="newsletter-email" className="text-sm font-semibold">
            Get the daily brief in your inbox
          </Label>
          <p className="text-xs text-muted-foreground">
            The top 10 AI stories, every morning at 07:30.
          </p>
          <Input
            id="newsletter-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            maxLength={255}
          />
        </div>
        <Button
          type="submit"
          disabled={busy || !email || !consent}
          className="bg-gradient-brand text-white hover:opacity-90 border-0"
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Subscribe
        </Button>
      </div>
      <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 accent-brand-turquoise"
        />
        <span>
          I agree to receive the daily AI brief by email and to the processing of my email address
          for this purpose (GDPR). I can unsubscribe at any time using the link in every email.
        </span>
      </label>
    </form>
  );
}
