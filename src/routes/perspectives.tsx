import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUp,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

import { listPerspectives } from "@/lib/news.functions";

export const Route = createFileRoute("/perspectives")({
  head: () => ({
    meta: [
      { title: "Research & Perspectives — The AI Frontier Brief" },
      {
        name: "description",
        content:
          "Hand-picked deeper reads, talks, and papers from experts shaping the field of AI.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(perspectivesQO),
  component: PerspectivesPage,
});

const perspectivesQO = queryOptions({
  queryKey: ["perspectives"],
  queryFn: () => listPerspectives(),
});

type Perspective = {
  source_key: string;
  source_label: string;
  source_link: string;
  title: string;
  url: string;
  summary: string;
  published_at: string | null;
};

function PerspectivesPage() {
  const { data } = useSuspenseQuery(perspectivesQO);
  const perspectivesFn = useServerFn(listPerspectives);

  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Perspective[]>(data.items);
  const [sources] = useState(data.sources);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem("perspectives:saved");
      if (raw) setSaved(new Set(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSave = (url: string) => {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
        toast.success("Removed from Saved for later");
      } else {
        next.add(url);
        toast.success("Saved for later");
      }
      try {
        localStorage.setItem("perspectives:saved", JSON.stringify(Array.from(next)));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  const filtered = activeSource
    ? items.filter((i) => i.source_key === activeSource)
    : items;

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await perspectivesFn();
      setItems(r.items);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to refresh perspectives");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to brief
              </Link>
            </Button>
          </div>
          <h1 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight text-gradient-brand">
            Research & Perspectives from Influential AI Voices
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Hand-picked deeper reads, talks, and papers from experts shaping the field.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-xs uppercase tracking-wide font-semibold text-brand-purple mr-1">
            Sources
          </span>
          <button
            onClick={() => setActiveSource(null)}
            className={
              "rounded-full px-3 py-1 text-xs border transition " +
              (activeSource === null
                ? "bg-gradient-brand text-white border-transparent"
                : "bg-background hover:bg-muted")
            }
          >
            All
          </button>
          {sources.map((s) => {
            const on = activeSource === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setActiveSource(on ? null : s.key)}
                className={
                  "rounded-full px-3 py-1 text-xs border transition " +
                  (on
                    ? "bg-gradient-brand text-white border-transparent"
                    : "bg-background hover:bg-muted")
                }
              >
                {s.label}
              </button>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
            className="ml-auto"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>

        <ScrollArea className="pr-3">
          {loading && items.length === 0 && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading perspectives…
            </div>
          )}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No items found for this source.
            </div>
          )}
          <section className="grid gap-4">
            {filtered.map((it) => {
              const isOpen = expanded.has(it.url);
              return (
                <Card key={it.url} className="overflow-hidden shadow-[var(--shadow-card)]">
                  <div className="h-1 bg-gradient-brand" />
                  <CardContent className="pt-5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="font-medium">
                        {it.source_label}
                      </Badge>
                      {it.published_at && (
                        <span>
                          ·{" "}
                          {new Date(it.published_at).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                          })}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 text-lg font-semibold leading-snug">
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {it.title}
                      </a>
                    </h3>
                    {it.summary && (
                      <>
                        <p
                          className={
                            "mt-2 text-sm text-muted-foreground leading-relaxed whitespace-pre-line " +
                            (isOpen ? "" : "line-clamp-2")
                          }
                        >
                          {it.summary}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            const n = new Set(expanded);
                            if (isOpen) n.delete(it.url);
                            else n.add(it.url);
                            setExpanded(n);
                          }}
                          className="mt-1 text-xs font-medium text-brand-purple hover:underline"
                        >
                          {isOpen ? "Show less" : "Read the whole summary"}
                        </button>
                      </>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-1">
                      <Button asChild size="sm" variant="ghost">
                        <a href={it.url} target="_blank" rel="noreferrer">
                          Open <ExternalLink className="ml-1 h-3.5 w-3.5" />
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleSave(it.url)}
                        className={saved.has(it.url) ? "text-brand-purple" : ""}
                      >
                        {saved.has(it.url) ? (
                          <>
                            <BookmarkCheck className="mr-1 h-3.5 w-3.5" /> Saved
                          </>
                        ) : (
                          <>
                            <Bookmark className="mr-1 h-3.5 w-3.5" /> Save for later
                          </>
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => copyLink(it.url)}>
                        <Link2 className="mr-1 h-3.5 w-3.5" /> Copy link
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </section>
        </ScrollArea>
      </main>
      <ScrollToTop />
    </div>
  );
}

function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-6 right-6 z-50 inline-flex items-center justify-center rounded-full bg-gradient-brand text-white shadow-lg hover:opacity-90 transition-opacity p-3"
      aria-label="Scroll to top"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
