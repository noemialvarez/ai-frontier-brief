
## The AI Frontier Brief

Single-page AI news aggregator. One click fetches the latest from your RSS sources, summarizes them with AI, tags them by theme, and shows them as cards you can save for later or share.

### Top of page

- **Headline**: "The AI Frontier Brief" — large display type, pink → purple → turquoise gradient fill on white background. (No subtitle.)
- **Actions row**:
  - `Get most recent news` — primary, gradient fill. Runs the fetch pipeline; toast shows "X new articles added".
  - `Add new source` — outline. Dialog with name + RSS URL.
  - `Suggest new sources` — outline. Opens a panel of AI-generated source suggestions (see below).
- Tab switcher: **All news** / **Saved for later**.
- Filters: source chips + theme chips (multi-select).

### News cards

- Source badge, title (linked), 2–3 sentence AI summary, theme tags, published date.
- Action row: **Read full article ↗** · **Save for later** (bookmark toggle) · **Copy link** (writes external URL to clipboard, shows "Copied!" toast).

### "Suggest new sources" panel

Clicking opens a panel/dialog with a list of AI-recommended sources that fit the app's themes and aren't already in the user's list. For each suggestion:

- Source name, type (RSS / YouTube / Substack), feed URL, one-line description.
- **3 example article titles** the AI thinks this source would have contributed (with publication dates if available).
- `Add this source` button — calls `addSource`, removes it from the list, refreshes the source filter chips.

How it works under the hood:
- Server fn `suggestNewSources()` calls Lovable AI Gateway (`google/gemini-3-flash-preview`) via tool-calling to return a structured `{ suggestions: [{ name, feed_url, kind, description, example_articles: [{title, date?}] }] }`.
- Prompt feeds it: the fixed theme list (hands-on tips · agentic AI · new business models · startups · prompt engineering · LLM news) and the names of sources already configured (so it doesn't repeat them).
- Returns 5–8 suggestions per click. Results are not persisted — click again for a fresh batch.
- Examples are AI-generated illustrative titles (not live-scraped), labeled as such in the UI to set expectations honestly.

### Sources (pre-seeded)

RSS / public feeds only:
- The Guardian — AI tag feed
- The Economist — Science & Technology feed (AI-filtered by AI tagger; full articles open in your browser where your subscription is active)
- One Useful Thing, Latent Space — Substack `/feed`
- AI House Davos — YouTube channel RSS

### Themes (AI-assigned per article)

hands-on tips · agentic AI · new business models · startups · prompt engineering · LLM news. Non-AI items dropped at ingestion.

### Design tokens (src/styles.css)

White background, soft shadows, generous whitespace.
- `--brand-pink`, `--brand-purple`, `--brand-turquoise`
- `--gradient-brand: linear-gradient(135deg, pink → purple → turquoise)`
- Used on: H1 (background-clip text), primary button fill, card top accent line, active chip, saved bookmark icon.

### Stack & data model

- **Stack**: TanStack Start + Lovable Cloud + Lovable AI Gateway (Gemini Flash). Single-user, no login.
- **Tables** (RLS enabled, permissive policies for single-user):
  - `sources` — id, name, feed_url (unique), kind ('rss'|'youtube'), created_at
  - `articles` — id, source_id (fk), external_url (unique), title, summary, themes (text[]), published_at, fetched_at, saved (bool default false)

### Server functions

- `fetchLatestNews` — for each source: fetch XML, parse with `fast-xml-parser`, dedupe by external_url, batch new items to AI for `{summary, themes, isAIRelated}`, insert AI-related items. Returns `{added, skipped, errors}`.
- `addSource` — validates URL, inserts.
- `listArticles` — filters by source/theme/saved, ordered by published_at desc.
- `toggleSaved` — flips `saved`.
- `suggestNewSources` — calls AI gateway with tool-calling, returns structured suggestions + example articles.

Client uses TanStack Query for all reads/mutations. Copy-link is `navigator.clipboard.writeText`.

### Out of scope

- LinkedIn, NYT, WSJ, X — excluded (no public API access).
- The Economist API — not used (subscriptions don't grant API access); RSS only.
- No auto-refresh / cron — manual button only. No login.
