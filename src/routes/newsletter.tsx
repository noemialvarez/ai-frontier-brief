import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { NewsletterSignup } from "@/components/NewsletterSignup";

export const Route = createFileRoute("/newsletter")({
  head: () => ({
    meta: [
      { title: "Newsletter — The AI Frontier Brief" },
      {
        name: "description",
        content: "Subscribe to the daily AI Frontier Brief newsletter.",
      },
      { property: "og:title", content: "Newsletter — The AI Frontier Brief" },
      {
        property: "og:description",
        content: "Subscribe to the daily AI Frontier Brief newsletter.",
      },
    ],
  }),
  component: NewsletterPage,
});

function NewsletterPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to the brief
          </Link>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-gradient-brand">
            The AI Frontier Brief — Newsletter
          </h1>
          <p className="mt-2 text-muted-foreground">
            Get the top 10 AI stories delivered to your inbox every morning at 07:30.
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <NewsletterSignup />
      </main>
    </div>
  );
}
