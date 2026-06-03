import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ---------- helpers ----------

const THEMES = [
  "hands-on tips",
  "agentic AI",
  "new business models",
  "startups",
  "prompt engineering",
  "LLM news",
] as const;

type FeedItem = {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
};

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

  // RSS or Atom
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

async function summarizeAndTag(items: { title: string; description: string }[]): Promise<
  { summary: string; themes: string[]; isAIRelated: boolean }[]
> {
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
            "You analyze news headlines for an AI-news brief. For each item, write a crisp 2-3 sentence summary, tag relevant themes from the fixed list, and decide whether it belongs in the brief. Mark isAIRelated=false (so the item is dropped) for: items not genuinely about AI; AND items whose primary angle is AI morality/ethics, public fears or complaints about AI, AI safety doom, autonomous weapons / killer drones, military AI ethics, regulation-of-AI debates framed around fear. Keep items focused on AI products, research, business, agents, LLMs, hands-on use, startups, prompt engineering.",
        },
        {
          role: "user",
          content: `Themes: ${THEMES.join(", ")}.\n\nItems (JSON array):\n${JSON.stringify(
            items.map((i, idx) => ({ idx, title: i.title, snippet: i.description.slice(0, 600) }))
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
                      summary: { type: "string", description: "2-3 sentence neutral summary." },
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

export const listArticles = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [articlesRes, sourcesRes] = await Promise.all([
    supabaseAdmin
      .from("articles")
      .select("id, source_id, external_url, title, summary, themes, published_at, fetched_at, saved")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("fetched_at", { ascending: false })
      .limit(500),
    supabaseAdmin.from("sources").select("id, name, kind, feed_url").order("name"),
  ]);
  if (articlesRes.error) throw new Error(articlesRes.error.message);
  if (sourcesRes.error) throw new Error(sourcesRes.error.message);
  return { articles: articlesRes.data ?? [], sources: sourcesRes.data ?? [] };
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("sources").insert({
      name: data.name,
      feed_url: data.feed_url,
      kind: data.kind,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleSaved = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), saved: z.boolean() }).parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("articles").update({ saved: data.saved }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const fetchLatestNews = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: sources, error } = await supabaseAdmin.from("sources").select("id, name, feed_url, kind");
  if (error) throw new Error(error.message);
  if (!sources || sources.length === 0) return { added: 0, skipped: 0, errors: [] as string[] };

  const errors: string[] = [];
  const candidates: {
    source_id: string;
    external_url: string;
    title: string;
    description: string;
    published_at: string | null;
  }[] = [];

  for (const src of sources) {
    try {
      const items = await parseFeed(src.feed_url, (src.kind as "rss" | "youtube") ?? "rss");
      for (const it of items.slice(0, 20)) {
        if (!it.link || !it.title) continue;
        candidates.push({
          source_id: src.id,
          external_url: it.link,
          title: stripHtml(it.title).slice(0, 500),
          description: stripHtml(it.description ?? ""),
          published_at: it.pubDate ? new Date(it.pubDate).toISOString() : null,
        });
      }
    } catch (e: any) {
      errors.push(`${src.name}: ${e.message ?? "fetch failed"}`);
    }
  }

  if (candidates.length === 0) return { added: 0, skipped: 0, errors };

  // Dedupe vs DB
  const urls = candidates.map((c) => c.external_url);
  const { data: existing } = await supabaseAdmin.from("articles").select("external_url").in("external_url", urls);
  const existingSet = new Set((existing ?? []).map((r) => r.external_url));
  const fresh = candidates.filter((c) => !existingSet.has(c.external_url));
  const skipped = candidates.length - fresh.length;

  if (fresh.length === 0) return { added: 0, skipped, errors };

  // AI analysis in batches of 10
  let added = 0;
  for (let i = 0; i < fresh.length; i += 10) {
    const batch = fresh.slice(i, i + 10);
    try {
      const analyses = await summarizeAndTag(batch.map((b) => ({ title: b.title, description: b.description })));
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
  const { data: existing } = await supabaseAdmin.from("sources").select("name, feed_url");
  const existingNames = (existing ?? []).map((s) => s.name);

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
            "You recommend high-signal RSS sources for an AI-news brief. Only suggest sources that publish an RSS/Atom or YouTube feed (Substacks, blogs, podcast feeds, YouTube channels, official tech blogs). Provide working canonical feed URLs when known (e.g. https://www.example.com/feed). For each, include 3 representative example article titles that would be the kind of content the source publishes (clearly illustrative, not live data). Avoid sources requiring login or paywalls (no NYT, no WSJ, no LinkedIn, no X). Avoid sources already in the user's list.",
        },
        {
          role: "user",
          content: `Themes to cover: ${THEMES.join(
            ", "
          )}.\n\nSources already configured: ${existingNames.join(", ") || "(none)"}.\n\nReturn 6 fresh recommendations.`,
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

  // Filter out any that match existing URLs/names
  const existingUrls = new Set((existing ?? []).map((s) => s.feed_url));
  const existingNameSet = new Set(existingNames.map((n) => n.toLowerCase()));
  parsed.suggestions = parsed.suggestions.filter(
    (s) => !existingUrls.has(s.feed_url) && !existingNameSet.has(s.name.toLowerCase())
  );

  return parsed;
});
