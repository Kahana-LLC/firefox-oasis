# History keyword search

Keyword history search finds pages you visited by matching a term against page titles, URLs, and indexed page snippets.

## Utterances

| Pattern | Mode | Example |
|---------|------|---------|
| `search history for [term]` | keyword | `search history for agents` |
| `search my browsing history for [term]` | keyword | `search my browsing history for oauth` |
| `find in my history for [term]` | keyword | `find in my history for transformers` |
| `search history for "[phrase]"` | keyword | preserves quoted phrase |
| `search history` | recent | lists recent visits |
| `what did I read about [topic]` | semantic | conceptual recall via embeddings |
| Many matches | refinement | assistant asks for site, date, or extra keywords |

## Refinement flow

When a keyword search finds **6 or more** plausible matches, the assistant asks for more context instead of dumping a long list. Reply with hints like:

- **When:** `last week`, `yesterday`, `last month`
- **Site:** `on github`, `from nytimes.com`
- **Extra keywords:** `cursor deployment`
- **Show anyway:** `show all`
- **Cancel:** `cancel`

Filters are applied locally to your history results; nothing is sent to a remote server.

## How it works

1. **Places** — Firefox history database matches `searchTerms` against title and URL (instant).
2. **Orama fulltext** — indexed page snippets are searched when the embedding index exists.
3. Results are merged, deduped by URL, and ranked by match quality.

## Privacy

Keyword mode sends the query to local Places and Orama only. Semantic mode uses local Assist embeddings; nothing is sent to a remote server for history search.
