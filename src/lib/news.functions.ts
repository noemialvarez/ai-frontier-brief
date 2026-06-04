import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

// ---------- helpers ----------

const THEMES = [
  "hands-on tips",
  "agentic AI",
  "prompt engineering",
  "AI future of work",
  "LLM news",
  "startups",
  "new business models",
] as const;

type FeedItem = {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
};

/** Returns the authenticated user id from the request, or null if anonymous. */
async function getOptionalUserId(): Promise<string | null> {
  try {
    const req = getRequest();
    const authHeader = req?.headers?.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7);
    if (!token) return null;
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data, error } = await sb.auth.getClaims(token);
    if (error || !data?.claims?.sub) return null;
    return data.claims.sub as string;
  } catch {
    return null;
  }
}

async function requireUserId(): Promise<string> {
  const uid = await getOptionalUserId();
  if (!uid) throw new Error("You must sign in to do that.");
  return uid;
}

async function parseFeed(url: string, kind: "rss" | "youtube"): Promise<FeedItem[]> {
  const { XMLParser } = await import("fast-xml-parser");
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AIFrontierBrief/1.0)" },
  });
  if (!res.ok) throw new Error(`Feed ${url} returned ${res.status}`);
  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const data = parser.parse(xml);

  if (kind === "youtube") {
    const entries = data?.feed?.entry;
    const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
    return list.map((e: any) => ({
      title: String(e.title ?? ""),
      link: e.link?.["@_href"] ?? e.link ?? "",
      description: e["media:group"]?.["media:description"] ?? "",
      pubDate: e.published,
    }));
  }

  const channelItems = data?.rss?.channel?.item;
  if (channelItems) {
    const list = Array.isArray(channelItems) ? channelItems : [channelItems];
    return list.map((i: any) => ({
      title: String(i.title?.["#text"] ?? i.title ?? ""),
      link: String(i.link?.["#text"] ?? i.link ?? ""),
      description: String(i.description ?? i["content:encoded"] ?? ""),
      pubDate: i.pubDate ?? i["dc:date"],
    }));
  }
  const atomEntries = data?.feed?.entry;
  if (atomEntries) {
    const list = Array.isArray(atomEntries) ? atomEntries : [atomEntries];
    return list.map((e: any) => {
      const linkEl = Array.isArray(e.link) ? e.link[0] : e.link;
      return {
        title: String(e.title?.["#text"] ?? e.title ?? ""),
        link: linkEl?.["@_href"] ?? linkEl ?? "",
        description: String(e.summary?.["#text"] ?? e.summary ?? e.content?.["#text"] ?? e.content ?? ""),
        pubDate: e.published ?? e.updated,
      };
    });
  }
  return [];
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function summarizeAndTag(
  items: { title: string; description: string }[],
  irrelevantExamples: string[] = []
): Promise<{ summary: string; themes: string[]; isAIRelated: boolean }[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const examplesBlock = irrelevantExamples.length
    ? `\n\nThe user has previously marked these article titles as IRRELEVANT. Treat anything thematically similar (same topic, same framing, same complaint) as isAIRelated=false:\n- ${irrelevantExamples
        .slice(0, 40)
        .join("\n- ")}`
    : "";

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "You analyze news articles for an AI-news brief whose readers want to consume the news in-place and only click through for the items they are deeply interested in. For each item, write a thorough, self-contained summary of 12-18 sentences (roughly 280-420 words) that lets the reader skip the source article entirely unless they want to go deeper. Cover: what happened, who is involved, key facts and numbers, relevant context and background, how it fits the broader AI landscape, notable quotes or claims, mechanisms or how-it-works details when applicable, reactions or implications, and what to watch next. Write in clear neutral prose organized in 2-4 short paragraphs (use \\n\\n between paragraphs) — not bullet points, not a teaser, no marketing fluff. Use only the title and snippet provided; do not invent facts or numbers. Then tag relevant themes from the fixed list, and decide whether it belongs in the brief. Mark isAIRelated=false (so the item is dropped) for: items not genuinely about AI; AND items whose primary angle is AI morality/ethics, public fears or complaints about AI, AI safety doom, autonomous weapons / killer drones, military AI ethics, regulation-of-AI debates framed around fear. Keep items focused on AI products, research, business, agents, LLMs, hands-on use, startups, prompt engineering." +
            examplesBlock,
        },
        {
          role: "user",
          content: `Themes: ${THEMES.join(", ")}.\n\nItems (JSON array):\n${JSON.stringify(
            items.map((i, idx) => ({ idx, title: i.title, snippet: i.description.slice(0, 2000) }))
          )}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "analyze_items",
            description: "Return analysis for each input item, in the same order.",
            parameters: {
              type: "object",
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      summary: { type: "string", description: "Thorough 12-18 sentence (~280-420 word) self-contained summary in 2-4 short paragraphs separated by \\n\\n." },
                      themes: {
                        type: "array",
                        items: { type: "string", enum: [...THEMES] },
                      },
                      isAIRelated: { type: "boolean" },
                    },
                    required: ["summary", "themes", "isAIRelated"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["results"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "analyze_items" } },
    }),
  });

  if (res.status === 429) throw new Error("AI rate limit hit. Try again in a minute.");
  if (res.status === 402) throw new Error("AI credits exhausted. Please add credits in your workspace.");
  if (!res.ok) throw new Error(`AI gateway error ${res.status}: ${await res.text()}`);

  const json: any = await res.json();
  const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI response missing tool call");
  const parsed = JSON.parse(args);
  return parsed.results as { summary: string; themes: string[]; isAIRelated: boolean }[];
}

// ---------- server functions ----------

/**
 * Returns articles + sources visible to the caller.
 * Anonymous: only global sources (user_id IS NULL), no per-user state.
 * Signed in: global sources + own sources; saved/irrelevant scoped to user.
 */
export const listArticles = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const userId = await getOptionalUserId();

  const sourcesQuery = supabaseAdmin
    .from("sources")
    .select("id, name, kind, feed_url, user_id")
    .in("kind", ["rss", "youtube"])
    .order("name");
  const sourcesRes = userId
    ? await sourcesQuery.or(`user_id.is.null,user_id.eq.${userId}`)
    : await sourcesQuery.is("user_id", null);
  if (sourcesRes.error) throw new Error(sourcesRes.error.message);
  const sources = sourcesRes.data ?? [];
  const sourceIds = sources.map((s) => s.id);

  if (sourceIds.length === 0) {
    return { articles: [], sources, userId };
  }

  // Articles from visible sources, excluding the user's irrelevant marks.
  let irrelevantIds = new Set<string>();
  let savedIds = new Set<string>();
  if (userId) {
    const [irrRes, savRes] = await Promise.all([
      supabaseAdmin.from("user_article_irrelevant").select("article_id").eq("user_id", userId),
      supabaseAdmin.from("user_article_saved").select("article_id").eq("user_id", userId),
    ]);
    irrelevantIds = new Set((irrRes.data ?? []).map((r) => r.article_id));
    savedIds = new Set((savRes.data ?? []).map((r) => r.article_id));
  }

  const articlesRes = await supabaseAdmin
    .from("articles")
    .select("id, source_id, external_url, title, summary, themes, published_at, fetched_at")
    .in("source_id", sourceIds)
    .eq("irrelevant", false)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("fetched_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(500);
  if (articlesRes.error) throw new Error(articlesRes.error.message);

  const articles = (articlesRes.data ?? [])
    .filter((a) => !irrelevantIds.has(a.id))
    .filter((a) => isLikelyEnglish(a.title) && isLikelyEnglish(a.summary ?? ""))
    .map((a) => ({ ...a, saved: savedIds.has(a.id) }));

  return { articles, sources, userId };
});

export const addSource = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(1).max(200),
        feed_url: z.string().url().max(1000),
        kind: z.enum(["rss", "youtube"]).default("rss"),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("sources").insert({
      name: data.name,
      feed_url: data.feed_url,
      kind: data.kind,
      user_id: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleSaved = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), saved: z.boolean() }).parse(input)
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.saved) {
      const { error } = await supabaseAdmin
        .from("user_article_saved")
        .upsert({ user_id: userId, article_id: data.id });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_article_saved")
        .delete()
        .eq("user_id", userId)
        .eq("article_id", data.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const markIrrelevant = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_article_irrelevant")
      .upsert({ user_id: userId, article_id: data.id });
    if (error) throw new Error(error.message);
    // also remove from saved if present
    await supabaseAdmin
      .from("user_article_saved")
      .delete()
      .eq("user_id", userId)
      .eq("article_id", data.id);
    return { ok: true };
  });

export const removeSource = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Only allow removing sources the user owns.
    const { data: src, error: sErr } = await supabaseAdmin
      .from("sources")
      .select("id, user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!src) throw new Error("Source not found");
    if (src.user_id !== userId) {
      throw new Error("This is a shared default source and can't be removed.");
    }
    await supabaseAdmin.from("articles").delete().eq("source_id", data.id);
    const { error } = await supabaseAdmin.from("sources").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const EXCLUDE_PATTERNS = [
  /\bmoral(ity|s)?\b/i,
  /\bethic(s|al)?\b/i,
  /\bkiller drone/i,
  /\bautonomous weapon/i,
  /\blethal autonomous/i,
  /\bweaponi[sz]/i,
  /\bdoom(er|sday)?\b/i,
  /\bexistential risk\b/i,
  /\bfear(s|ed|ing)?\b.*\bAI\b/i,
  /\bAI\b.*\bfear(s|ed|ing)?\b/i,
  /\bcomplain(t|ts|ing)\b/i,
];

function isExcludedByKeywords(title: string, description: string): boolean {
  const text = `${title}\n${description}`;
  return EXCLUDE_PATTERNS.some((re) => re.test(text));
}

export const fetchLatestNews = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const userId = await getOptionalUserId();

  // Only fetch from sources visible to the caller.
  const sourcesQuery = supabaseAdmin.from("sources").select("id, name, feed_url, kind, user_id");
  const sRes = userId
    ? await sourcesQuery.or(`user_id.is.null,user_id.eq.${userId}`)
    : await sourcesQuery.is("user_id", null);
  if (sRes.error) throw new Error(sRes.error.message);
  const sources = sRes.data ?? [];
  if (sources.length === 0) return { added: 0, skipped: 0, errors: [] as string[] };

  const errors: string[] = [];
  const candidates: {
    source_id: string;
    external_url: string;
    title: string;
    description: string;
    published_at: string | null;
  }[] = [];

  const withTimeout = <T,>(p: Promise<T>, ms: number, label: string) =>
    Promise.race<T>([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
    ]);

  const feedResults = await Promise.allSettled(
    sources.map(async (src) => {
      try {
        const items = await withTimeout(
          parseFeed(src.feed_url, (src.kind as "rss" | "youtube") ?? "rss"),
          15000,
          src.name
        );
        return { src, items };
      } catch (e: any) {
        throw new Error(`${src.name}: ${e?.message ?? "fetch failed"}`);
      }
    })
  );

  for (const r of feedResults) {
    if (r.status === "rejected") {
      errors.push(r.reason?.message ?? "fetch failed");
      continue;
    }
    const { src, items } = r.value;
    for (const it of items.slice(0, 15)) {
      if (!it.link || !it.title) continue;
      const title = stripHtml(it.title).slice(0, 500);
      const description = stripHtml(it.description ?? "");
      if (isExcludedByKeywords(title, description)) continue;
      candidates.push({
        source_id: src.id,
        external_url: it.link,
        title,
        description,
        published_at: it.pubDate ? new Date(it.pubDate).toISOString() : null,
      });
    }
  }

  if (candidates.length === 0) return { added: 0, skipped: 0, errors };

  const urls = candidates.map((c) => c.external_url);
  const { data: existing } = await supabaseAdmin.from("articles").select("external_url").in("external_url", urls);
  const existingSet = new Set((existing ?? []).map((r) => r.external_url));
  const fresh = candidates.filter((c) => !existingSet.has(c.external_url));
  const skipped = candidates.length - fresh.length;

  if (fresh.length === 0) return { added: 0, skipped, errors };

  // Learn from this user's irrelevant marks (titles).
  let irrelevantExamples: string[] = [];
  if (userId) {
    const { data: rows } = await supabaseAdmin
      .from("user_article_irrelevant")
      .select("article_id, articles(title)")
      .eq("user_id", userId)
      .limit(40);
    irrelevantExamples = (rows ?? [])
      .map((r: any) => r.articles?.title)
      .filter((t: any): t is string => typeof t === "string");
  }

  let added = 0;
  for (let i = 0; i < fresh.length; i += 10) {
    const batch = fresh.slice(i, i + 10);
    try {
      const analyses = await summarizeAndTag(
        batch.map((b) => ({ title: b.title, description: b.description })),
        irrelevantExamples
      );
      const toInsert = batch
        .map((b, idx) => ({ b, a: analyses[idx] }))
        .filter(({ a }) => a && a.isAIRelated)
        .map(({ b, a }) => ({
          source_id: b.source_id,
          external_url: b.external_url,
          title: b.title,
          summary: a.summary,
          themes: a.themes,
          published_at: b.published_at,
        }));
      if (toInsert.length > 0) {
        const { error: insErr } = await supabaseAdmin.from("articles").insert(toInsert);
        if (insErr) errors.push(`insert: ${insErr.message}`);
        else added += toInsert.length;
      }
    } catch (e: any) {
      errors.push(`AI batch: ${e.message ?? "failed"}`);
    }
  }

  return { added, skipped, errors };
});

export const suggestNewSources = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const userId = await getOptionalUserId();
  const sourcesQuery = supabaseAdmin.from("sources").select("name, feed_url, user_id");
  const existingRes = userId
    ? await sourcesQuery.or(`user_id.is.null,user_id.eq.${userId}`)
    : await sourcesQuery.is("user_id", null);
  const existing = existingRes.data ?? [];
  const existingNames = existing.map((s) => s.name);

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "You recommend high-signal sources for an AI-news brief. Suggest a MIX of: written sources (Substacks, blogs, official tech blogs with RSS/Atom) AND podcast feeds (RSS feeds from Apple Podcasts/Overcast/podcast websites — anything with an enclosure-based RSS feed) AND YouTube channels (use the channel's RSS, e.g. https://www.youtube.com/feeds/videos.xml?channel_id=...). At least 2 of your 6 recommendations MUST be podcast feeds. For podcast feeds, the 3 example items should be illustrative EPISODE titles (and you may include a brief summary-style description that hints at what an episode would cover). Provide working canonical feed URLs. Avoid sources requiring login or paywalls (no NYT, no WSJ, no LinkedIn, no X). Avoid sources already in the user's list. Do NOT suggest sources whose primary angle is AI ethics/morality, public fears about AI, or autonomous weapons debates.",
        },
        {
          role: "user",
          content: `Themes to cover: ${THEMES.join(
            ", "
          )}.\n\nSources already configured: ${existingNames.join(", ") || "(none)"}.\n\nReturn 6 fresh recommendations including at least 2 podcasts.`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "recommend_sources",
            description: "Return source recommendations.",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      feed_url: { type: "string" },
                      kind: { type: "string", enum: ["rss", "youtube"] },
                      description: { type: "string" },
                      example_articles: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: { title: { type: "string" } },
                          required: ["title"],
                          additionalProperties: false,
                        },
                        minItems: 3,
                        maxItems: 3,
                      },
                    },
                    required: ["name", "feed_url", "kind", "description", "example_articles"],
                    additionalProperties: false,
                  },
                  minItems: 4,
                  maxItems: 8,
                },
              },
              required: ["suggestions"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "recommend_sources" } },
    }),
  });

  if (res.status === 429) throw new Error("AI rate limit hit. Try again in a minute.");
  if (res.status === 402) throw new Error("AI credits exhausted. Please add credits in your workspace.");
  if (!res.ok) throw new Error(`AI gateway error ${res.status}`);

  const json: any = await res.json();
  const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI response missing tool call");
  const parsed = JSON.parse(args) as {
    suggestions: {
      name: string;
      feed_url: string;
      kind: "rss" | "youtube";
      description: string;
      example_articles: { title: string }[];
    }[];
  };

  const existingUrls = new Set(existing.map((s) => s.feed_url));
  const existingNameSet = new Set(existingNames.map((n) => n.toLowerCase()));
  parsed.suggestions = parsed.suggestions.filter(
    (s) => !existingUrls.has(s.feed_url) && !existingNameSet.has(s.name.toLowerCase())
  );

  return parsed;
});

/**
 * Returns sources added by OTHER signed-in users (not global defaults, not the caller's own).
 * Used to power the "Add sources from Top Contributors" inspiration list.
 * Anonymous callers get all user-contributed sources.
 */
export const listContributorSources = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const userId = await getOptionalUserId();
  let q = supabaseAdmin
    .from("sources")
    .select("id, name, kind, feed_url, user_id, created_at")
    .not("user_id", "is", null)
    .in("kind", ["rss", "youtube"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (userId) q = q.neq("user_id", userId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  // Dedupe by feed_url (multiple users may have added the same feed) — keep newest, count contributors.
  const map = new Map<string, { name: string; feed_url: string; kind: string; contributors: number }>();
  for (const s of data ?? []) {
    const existing = map.get(s.feed_url);
    if (existing) {
      existing.contributors += 1;
    } else {
      map.set(s.feed_url, { name: s.name, feed_url: s.feed_url, kind: s.kind, contributors: 1 });
    }
  }
  return { suggestions: Array.from(map.values()).sort((a, b) => b.contributors - a.contributors) };
});

/**
 * Fetches articles/videos/papers from a small curated set of influential AI voices.
 * Used by the "Research & Perspectives" view.
 */
type PerspectiveSource =
  | { key: string; label: string; kind: "youtube"; handle: string; link: string }
  | { key: string; label: string; kind: "rss"; feed_url: string; link: string }
  | { key: string; label: string; kind: "html"; link: string };

const PERSPECTIVE_SOURCES: PerspectiveSource[] = [
  {
    key: "ai-house-davos",
    label: "AI House Davos",
    kind: "youtube",
    handle: "AIHouseDavos",
    link: "https://www.youtube.com/@AIHouseDavos",
  },
  {
    key: "ilya-papers",
    label: "Ilya Sutskever's 30 Foundational Papers",
    kind: "rss",
    feed_url: "https://medium.com/feed/ilya-sutskevers-30-foundational-papers-of-ai",
    link: "https://medium.com/ilya-sutskevers-30-foundational-papers-of-ai",
  },
  {
    key: "karen-hao-clips",
    label: "Karen Hao — Selected Writing",
    kind: "html",
    link: "https://karendhao.com/clips",
  },
];

let _ytChannelIdCache: Record<string, string> = {};
async function resolveYoutubeChannelId(handle: string): Promise<string | null> {
  if (_ytChannelIdCache[handle]) return _ytChannelIdCache[handle];
  try {
    const res = await fetch(`https://www.youtube.com/@${handle}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AIFrontierBrief/1.0)" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/"channelId":"(UC[\w-]+)"/) || html.match(/"externalId":"(UC[\w-]+)"/);
    if (m?.[1]) {
      _ytChannelIdCache[handle] = m[1];
      return m[1];
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Heuristic: detect if a string is predominantly English/Latin-script. */
function isLikelyEnglish(text: string): boolean {
  if (!text) return true;
  // CJK, Cyrillic, Arabic, Hebrew, Devanagari, Thai, Greek
  const nonLatin = (text.match(
    /[\u0370-\u03FF\u0400-\u04FF\u0500-\u052F\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u3000-\u9FFF\uAC00-\uD7AF\u3040-\u30FF]/g,
  ) || []).length;
  const letters = (text.match(/\p{L}/gu) || []).length;
  if (letters === 0) return true;
  return nonLatin / letters < 0.2;
}

async function fetchKarenHaoClips(): Promise<FeedItem[]> {
  const res = await fetch("https://karendhao.com/clips", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AIFrontierBrief/1.0)" },
  });
  if (!res.ok) throw new Error(`karendhao.com returned ${res.status}`);
  const html = await res.text();
  const items: FeedItem[] = [];
  const seen = new Set<string>();
  // Anchor tags with external https hrefs and inner text
  const linkRe = /<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const url = m[1];
    const inner = stripHtml(m[2]).trim();
    if (!inner || inner.length < 10) continue;
    if (url.includes("karendhao.com") || url.includes("squarespace")) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    // Try to capture nearby year, e.g. "</a>, 2025."
    const tail = html.slice(linkRe.lastIndex, linkRe.lastIndex + 40);
    const yearMatch = tail.match(/(\d{4})/);
    items.push({
      title: inner,
      link: url,
      description: "",
      pubDate: yearMatch ? `${yearMatch[1]}-01-01T00:00:00Z` : undefined,
    });
  }
  return items;
}

export const addPerspectiveSource = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(1).max(200),
        feed_url: z.string().url().max(1000),
        kind: z.enum(["perspective_rss", "perspective_youtube"]).default("perspective_rss"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("sources").insert({
      name: data.name,
      feed_url: data.feed_url,
      kind: data.kind,
      user_id: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPerspectives = createServerFn({ method: "GET" }).handler(async () => {
  const results: {
    source_key: string;
    source_label: string;
    source_link: string;
    title: string;
    url: string;
    summary: string;
    published_at: string | null;
  }[] = [];

  // Load user-contributed perspective sources from DB.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const userPerspRes = await supabaseAdmin
    .from("sources")
    .select("id, name, feed_url, kind")
    .in("kind", ["perspective_rss", "perspective_youtube"]);
  const userSources: PerspectiveSource[] = (userPerspRes.data ?? []).map((s) => {
    if (s.kind === "perspective_youtube") {
      // feed_url may be a channel URL like https://www.youtube.com/@handle
      const handleMatch = s.feed_url.match(/youtube\.com\/@([^/?#]+)/);
      const handle = handleMatch?.[1] ?? "";
      return {
        key: `user-${s.id}`,
        label: s.name,
        kind: "youtube",
        handle,
        link: s.feed_url,
      };
    }
    return {
      key: `user-${s.id}`,
      label: s.name,
      kind: "rss",
      feed_url: s.feed_url,
      link: s.feed_url,
    };
  });

  const all: PerspectiveSource[] = [...PERSPECTIVE_SOURCES, ...userSources];

  for (const src of all) {
    try {
      let items: FeedItem[] = [];
      if (src.kind === "youtube") {
        if (!src.handle) continue;
        const channelId = await resolveYoutubeChannelId(src.handle);
        if (!channelId) continue;
        items = await parseFeed(
          `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
          "youtube",
        );
      } else if (src.kind === "rss") {
        items = await parseFeed(src.feed_url, "rss");
      } else if (src.kind === "html" && src.key === "karen-hao-clips") {
        items = await fetchKarenHaoClips();
      }
      for (const it of items.slice(0, 30)) {
        if (!it.title || !it.link) continue;
        const title = stripHtml(it.title);
        const summary = stripHtml(it.description ?? "").slice(0, 1200);
        // English-only filter
        if (!isLikelyEnglish(title) || (summary && !isLikelyEnglish(summary))) continue;
        results.push({
          source_key: src.key,
          source_label: src.label,
          source_link: src.link,
          title,
          url: it.link,
          summary,
          published_at: it.pubDate ? new Date(it.pubDate).toISOString() : null,
        });
      }
    } catch {
      // skip failing source silently
    }
  }

  results.sort((a, b) => {
    const ta = a.published_at ? Date.parse(a.published_at) : 0;
    const tb = b.published_at ? Date.parse(b.published_at) : 0;
    return tb - ta;
  });

  const sources = all.map((s) => ({ key: s.key, label: s.label, link: s.link }));
  return { items: results, sources };
});
