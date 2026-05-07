# utils/ — Deterministic Routing (Non-AI Fallback)

This folder implements the rule-based routing system that works WITHOUT
the remote LLM. It's used as a fallback when the Assist API is
unavailable, and also as a guard/override layer on top of LLM routing
(e.g., for ambiguity detection).

## Call Hierarchy

Understanding which file calls which is the key to navigating this
folder. Here's the complete call chain:

```
deterministicRouter.ts          ← Entry point (called from graph.ts)
│   Gets a routing state snapshot, then delegates to:
│
└── decisionEngine.ts           ← Orchestrator: tries resolvers in order
    │
    ├── 1. intentParser.ts      ← Classifies input as list/search/mutation/other
    │
    ├── 2. Family-specific resolvers (one runs based on classification):
    │   ├── manifestListResolver.ts    ← "list tabs", "show my groups"
    │   ├── manifestSearchResolver.ts  ← "search X", "find X in Y folder"
    │   └── manifestMutationResolver.ts ← "add X to Y", "delete X"
    │       └── mutationExplicitResolver.ts  ← Regex rules for mutations
    │
    ├── 3. searchResultExplicitResolver.ts  ← "open the first result"
    ├── 4. summarizeExplicitResolver.ts     ← "summarize this page"
    └── 5. explicitRouteRules.ts            ← "open google.com", "new window"
```

If none of these match, returns `no_match` and the supervisor routes
to the chat node.

## Files by Purpose

### Entry Points
- **deterministicRouter.ts** — Thin wrapper. Gets a state snapshot from
  the cache and calls `decideDeterministicRoute()`.
- **decisionEngine.ts** — The orchestrator. Classifies the command
  family, runs the appropriate resolver, falls through to explicit
  rules, and returns a routing decision.

### Intent Classification
- **intentParser.ts** — Regex-based NLP that classifies user text:
  - `classifyCommandFamily()`: returns list/search/mutation/other
  - `parseContainerAddIntent()`: "add X to Y" pattern extraction
  - `parseCloseDeleteTargetIntent()`: "close/delete X" extraction
  - `parseSearchMemoryIntent()`: "search X in Y folder" extraction
  - `looksActionableText()`: does the text have an action verb + object?

### Family Resolvers
- **manifestListResolver.ts** — Handles "list/show" commands. Parses
  the target name, checks if it's a tab group or bookmark folder
  via the routing state snapshot, returns the right args.
- **manifestSearchResolver.ts** — Handles "search/find" commands.
  Extracts query and optional folder scope. Cross-references folder
  names with the routing state to validate folder targets.
- **manifestMutationResolver.ts** — Handles "add/delete/rename/close"
  commands. Delegates to mutationExplicitResolver for specific
  pattern matching and to intentParser for container-add parsing.
- **mutationExplicitResolver.ts** — Array of regex rules for mutation
  commands: split tabs, close tab, create group, rename folder, etc.
  Each rule extracts specific args from the user text.

### General Pattern Matchers
- **explicitRouteRules.ts** — Catches commands that don't fit a family:
  "open <url>", "new window", "organize windows", "copy tab urls",
  "show subscription". Each rule is a regex with an arg extractor.
- **searchResultExplicitResolver.ts** — Catches follow-up commands
  like "open it", "open the first result", "open result 3".
- **summarizeExplicitResolver.ts** — Catches "summarize this page",
  "summarize tab 3", etc.

### Support Files
- **commandManifest.ts** — Static mapping of known phrases to command
  names. E.g., "list bookmark folders" → `list_bookmark_folders`.
  Used by `manifestResolver.ts` for phrase-based matching.
- **manifestResolver.ts** — Finds the best matching manifest entry
  for a given input string. Used by all family resolvers.
- **manifestTypes.ts** — Type definitions for commandManifest entries.
- **routingStateCache.ts** — Caches current tab group and bookmark
  folder names from the live browser. The resolvers use this to
  verify that a target name like "Research" actually exists.
- **routerTypes.ts** — Type definitions for routing decisions, route
  args, routing state snapshots, and intent families.
- **routingUtils.ts** — Small helpers: `looksLikeNewActionCommand()`,
  `parseAmbiguityResolution()`.

### Non-Routing Utils
- **assistantLogger.ts** — Structured logging with domain tags
  (router, graph, search-memory, etc.).
- **streamGuards.ts** — Detects infinite loops in graph execution.
  Tracks step count and same-step streaks.
- **localMemoryUtils.ts** — Helpers for localMemory.ts: dedupe key
  computation, metadata field extraction.
- **searchMemoryUtils.ts** — Helpers for search_memory results:
  bookmark folder URL map building, stale result filtering.
- **entityResolver.ts** — Resolves entity references in user text.
