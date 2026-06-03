import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Link2,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import appIcon from "@/assets/app-icon.png";

// Sources known to require a paid subscription / paywall to read full articles.
const PAYWALL_PATTERNS: RegExp[] = [
  /rundown ai/i,
  /the information/i,
  /stratechery/i,
  /wall street journal|wsj/i,
  /new york times|nyt/i,
  /financial times|^ft$|ft\.com/i,
  /bloomberg/i,
  /the economist/i,
  /economist\.com/i,
  /platformer/i,
  /^the atlantic/i,
];
const isPaywalledSource = (name?: string) =>
  !!name && PAYWALL_PATTERNS.some((re) => re.test(name));

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
  addSource,
  fetchLatestNews,
  listArticles,
  markIrrelevant,
  removeSource,
  suggestNewSources,
  toggleSaved,
} from "@/lib/news.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The AI Frontier Brief" },
      {
        name: "description",
        content:
          "Your daily compiled AI brief — pull the latest articles from your trusted sources, summarized and tagged.",
      },
      { property: "og:title", content: "The AI Frontier Brief" },
      {
        property: "og:description",
        content: "Compile the latest AI news from your trusted sources, summarized in one click.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(articlesQO),
  component: Home,
});

export const articlesQO = queryOptions({
  queryKey: ["articles"],
  queryFn: () => listArticles(),
});

const THEMES = [
  "hands-on tips",
  "agentic AI",
  "new business models",
  "startups",
  "prompt engineering",
  "LLM news",
  "AI future of work",
] as const;

export function Home() {
  const { data } = useSuspenseQuery(articlesQO);
  const queryClient = useQueryClient();

  const fetchFn = useServerFn(fetchLatestNews);
  const addFn = useServerFn(addSource);
  const toggleFn = useServerFn(toggleSaved);
  const suggestFn = useServerFn(suggestNewSources);
  const removeFn = useServerFn(removeSource);
  const irrelevantFn = useServerFn(markIrrelevant);

  const { user } = useSession();
  const isSignedIn = !!user;

  const [tab, setTab] = useState<"all" | "saved">("all");
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set());
  const [activeThemes, setActiveThemes] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["articles"] });

  // Refetch when auth state changes so per-user state (saved/irrelevant/own sources) is correct.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries({ queryKey: ["articles"] });
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  const requireAuth = (action: string) => {
    toast.error("Please sign in", {
      description: `You need to be signed in to ${action}.`,
    });
  };

  const fetchMut = useMutation({
    mutationFn: () => fetchFn(),
    onSuccess: (r) => {
      if (r.added > 0) toast.success(`${r.added} new article${r.added === 1 ? "" : "s"} added`);
      else toast.message("You're up to date", { description: `${r.skipped} items already in your feed.` });
      if (r.errors.length) toast.warning("Some sources failed", { description: r.errors.slice(0, 3).join("\n") });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; saved: boolean }) => toggleFn({ data: v }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    return data.articles.filter((a) => {
      if (tab === "saved" && !a.saved) return false;
      if (activeSources.size > 0 && !activeSources.has(a.source_id)) return false;
      if (activeThemes.size > 0 && !a.themes.some((t) => activeThemes.has(t))) return false;
      return true;
    });
  }, [data.articles, tab, activeSources, activeThemes]);

  const sourceById = useMemo(
    () => new Map(data.sources.map((s) => [s.id, s])),
    [data.sources]
  );

  // Show AI House Davos in the 9th position (index 8) if present.
  const orderedSources = useMemo(() => {
    const arr = [...data.sources];
    const idx = arr.findIndex((s) => /ai\s*house/i.test(s.name));
    if (idx === -1) return arr;
    const [aiHouse] = arr.splice(idx, 1);
    const target = Math.min(8, arr.length);
    arr.splice(target, 0, aiHouse);
    return arr;
  }, [data.sources]);

  const toggleSetItem = (set: Set<string>, val: string, setter: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(val)) n.delete(val);
    else n.add(val);
    setter(n);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <img
                src={appIcon}
                alt="AI Frontier Brief"
                width={64}
                height={64}
                className="h-14 w-14 rounded-2xl shadow-md shrink-0"
              />
              <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-gradient-brand">
                The AI Frontier Brief
              </h1>
            </div>
            <div className="shrink-0">
              {isSignedIn ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground hidden sm:inline">{user?.email}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await supabase.auth.signOut();
                      toast.success("Signed out");
                    }}
                  >
                    <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sign out
                  </Button>
                </div>
              ) : (
                <Button asChild variant="outline" size="sm" className="border-brand-turquoise">
                  <Link to="/auth">
                    <LogIn className="mr-1.5 h-3.5 w-3.5" /> Sign in
                  </Link>
                </Button>
              )}
            </div>
          </div>
          {!isSignedIn && (
            <p className="mt-3 text-sm text-muted-foreground">
              You're viewing the default feed.{" "}
              <Link to="/auth" className="underline text-brand-turquoise font-medium">
                Sign in
              </Link>{" "}
              to add your own sources, save articles, and tune the brief — your changes stay
              private to your account.
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              onClick={() => fetchMut.mutate()}
              disabled={fetchMut.isPending}
              className="bg-gradient-brand text-white hover:opacity-90 border-0 shadow-md"
            >
              {fetchMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Get most recent news
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => (isSignedIn ? setAddOpen(true) : requireAuth("add a source"))}
              className="bg-white border-2 border-brand-turquoise text-foreground hover:bg-brand-turquoise/10"
            >
              <Plus className="mr-2 h-4 w-4" /> Add new source
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => (isSignedIn ? setSuggestOpen(true) : requireAuth("get source suggestions"))}
              className="bg-white border-2 border-brand-turquoise text-foreground hover:bg-brand-turquoise/10"
            >
              <Sparkles className="mr-2 h-4 w-4" /> Suggest new sources
            </Button>
          </div>
        </div>
      </header>


      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "saved")}>
            <TabsList className="border border-brand-turquoise/40 bg-background">
              <TabsTrigger value="all">All news ({data.articles.length})</TabsTrigger>
              <TabsTrigger value="saved">
                Saved ({data.articles.filter((a) => a.saved).length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {(data.sources.length > 0 || true) && (
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide font-semibold text-brand-purple mr-1">
                Sources
              </span>
              {orderedSources.map((s) => {
                const on = activeSources.has(s.id);
                const canRemove = isSignedIn && (s as any).user_id === user?.id;
                return (
                  <span
                    key={s.id}
                    className={
                      "inline-flex items-center rounded-full text-xs border transition overflow-hidden " +
                      (on
                        ? "bg-gradient-brand text-white border-transparent"
                        : "bg-background hover:bg-muted")
                    }
                  >
                    <button
                      onClick={() => toggleSetItem(activeSources, s.id, setActiveSources)}
                      className="px-3 py-1"
                    >
                      {s.name}
                    </button>
                    {canRemove && (
                      <button
                        aria-label={`Remove ${s.name}`}
                        onClick={async () => {
                          if (!confirm(`Remove "${s.name}"? Its articles will be deleted from your feed.`)) return;
                          try {
                            await removeFn({ data: { id: s.id } });
                            toast.success(`Removed "${s.name}"`);
                            const n = new Set(activeSources);
                            n.delete(s.id);
                            setActiveSources(n);
                            invalidate();
                          } catch (e: any) {
                            toast.error(e.message ?? "Failed to remove source");
                          }
                        }}
                        className={
                          "px-1.5 py-1 border-l " +
                          (on ? "border-white/30 hover:bg-white/10" : "border-border hover:bg-destructive/10 hover:text-destructive")
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                );
              })}

            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wide font-semibold text-brand-purple mr-1">
                Themes
              </span>
              {THEMES.map((t) => {
                const on = activeThemes.has(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleSetItem(activeThemes, t, setActiveThemes)}
                    className={
                      "rounded-full px-3 py-1 text-xs border transition capitalize " +
                      (on
                        ? "bg-gradient-brand text-white border-transparent"
                        : "bg-background hover:bg-muted")
                    }
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <section className="mt-8 grid gap-4">
          {filtered.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  {data.articles.length === 0
                    ? "No articles yet. Click ‘Get most recent news’ to compile your first brief."
                    : "No articles match the current filters."}
                </p>
              </CardContent>
            </Card>
          )}
          {filtered.map((a) => {
            const src = sourceById.get(a.source_id);
            return (
              <Card key={a.id} className="overflow-hidden shadow-[var(--shadow-card)]">
                <div className="h-1 bg-gradient-brand" />
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="font-medium">
                      {src?.name ?? "Unknown source"}
                    </Badge>
                    {a.published_at && (
                      <span>
                        · {new Date(a.published_at).toLocaleDateString("en-US", {
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
                      href={a.external_url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {a.title}
                    </a>
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{a.summary}</p>
                  {a.themes.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {a.themes.map((t) => (
                        <span
                          key={t}
                          className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-muted text-muted-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" variant="ghost">
                      <a href={a.external_url} target="_blank" rel="noreferrer">
                        Read full article <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        isSignedIn
                          ? toggleMut.mutate({ id: a.id, saved: !a.saved })
                          : requireAuth("save articles")
                      }
                    >
                      {a.saved ? (
                        <>
                          <BookmarkCheck className="mr-1 h-4 w-4 text-[oklch(0.55_0.27_295)]" /> Saved
                        </>
                      ) : (
                        <>
                          <Bookmark className="mr-1 h-4 w-4" /> Save for later
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await navigator.clipboard.writeText(a.external_url);
                        toast.success("Link copied");
                      }}
                    >
                      <Link2 className="mr-1 h-4 w-4" /> Copy link
                    </Button>
                    {isPaywalledSource(src?.name) && (
                      <span
                        className="ml-auto text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded"
                        style={{ color: "oklch(0.78 0.08 295)", backgroundColor: "oklch(0.97 0.02 295)" }}
                        title="This source requires a paid subscription to read the full article."
                      >
                        Paywall
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={async () => {
                        if (!isSignedIn) {
                          requireAuth("mark articles as irrelevant");
                          return;
                        }
                        try {
                          await irrelevantFn({ data: { id: a.id } });
                          toast.success("Marked as irrelevant", {
                            description: "We'll filter out similar articles next time.",
                          });
                          invalidate();
                        } catch (e: any) {
                          toast.error(e.message ?? "Failed to mark as irrelevant");
                        }
                      }}
                    >
                      <ThumbsDown className="mr-1 h-4 w-4" /> Mark as irrelevant
                    </Button>

                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      </main>

      <AddSourceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={async (v) => {
          try {
            await addFn({ data: v });
            toast.success(`Added “${v.name}”`);
            setAddOpen(false);
            invalidate();
          } catch (e: any) {
            toast.error(e.message ?? "Failed to add source");
          }
        }}
      />

      <SuggestSourcesDialog
        open={suggestOpen}
        onOpenChange={setSuggestOpen}
        fetchSuggestions={() => suggestFn()}
        onAdd={async (v) => {
          try {
            await addFn({ data: v });
            toast.success(`Added “${v.name}”`);
            invalidate();
          } catch (e: any) {
            toast.error(e.message ?? "Failed to add source");
          }
        }}
      />
    </div>
  );
}

function AddSourceDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (v: { name: string; feed_url: string; kind: "rss" | "youtube" }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<"rss" | "youtube">("rss");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a new source</DialogTitle>
          <DialogDescription>
            Paste any RSS/Atom feed URL or a YouTube channel feed URL.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="src-name">Name</Label>
            <Input id="src-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Information — AI" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="src-url">Feed URL</Label>
            <Input id="src-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/feed" />
          </div>
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <div className="flex gap-2">
              {(["rss", "youtube"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={
                    "rounded-md px-3 py-1.5 text-sm border " +
                    (kind === k ? "bg-gradient-brand text-white border-transparent" : "bg-background")
                  }
                >
                  {k === "rss" ? "RSS / Atom" : "YouTube channel"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={busy || !name || !url}
            className="bg-gradient-brand text-white"
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit({ name, feed_url: url, kind });
                setName("");
                setUrl("");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add source
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Suggestion = {
  name: string;
  feed_url: string;
  kind: "rss" | "youtube";
  description: string;
  example_articles: { title: string }[];
};

function SuggestSourcesDialog({
  open,
  onOpenChange,
  fetchSuggestions,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fetchSuggestions: () => Promise<{ suggestions: Suggestion[] }>;
  onAdd: (v: { name: string; feed_url: string; kind: "rss" | "youtube" }) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchSuggestions();
      setItems(r.suggestions);
      setAdded(new Set());
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o && items.length === 0) void load();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Suggested sources</DialogTitle>
          <DialogDescription>
            AI-recommended feeds that fit your themes. Example articles are illustrative — they show
            the kind of content each source publishes.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating suggestions…
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">No suggestions yet.</div>
          )}
          <div className="space-y-3">
            {items.map((s) => {
              const isAdded = added.has(s.feed_url);
              return (
                <div key={s.feed_url} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">{s.name}</h4>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {s.kind}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                      <a
                        href={s.feed_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs text-muted-foreground underline truncate max-w-full"
                      >
                        {s.feed_url}
                      </a>
                    </div>
                    <Button
                      size="sm"
                      disabled={isAdded}
                      className={isAdded ? "" : "bg-gradient-brand text-white"}
                      variant={isAdded ? "outline" : "default"}
                      onClick={async () => {
                        await onAdd({ name: s.name, feed_url: s.feed_url, kind: s.kind });
                        setAdded((prev) => new Set(prev).add(s.feed_url));
                      }}
                    >
                      {isAdded ? "Added" : "Add source"}
                    </Button>
                  </div>
                  <div className="mt-3">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                      Example articles this source would publish
                    </div>
                    <ul className="space-y-1">
                      {s.example_articles.slice(0, 3).map((a, i) => (
                        <li key={i} className="text-sm flex gap-2">
                          <span className="text-muted-foreground">→</span>
                          <span>{a.title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={load} disabled={loading} variant="outline">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Regenerate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
