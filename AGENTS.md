<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- baton:coordination -->
## Multi-agent coordination (Baton)

Baton coordinates the agent sessions in this repo via the `baton` MCP tools.

- Orient first: read `CODEBASE.md` (the token-cheap repo map) and call
  `recall_memory` with your topic — evidence-checked facts from earlier
  sessions, stale ones withheld. Don't re-scan the repo.
- Before editing shared files: `check_files` with the paths. Busy → prefer
  other work and re-check later. After waiting, `get_report` — your issue
  may already be fixed.
- While working: call `touch_files` when you start editing shared files and
  keep a one-line `report_progress` fresh — that is how sibling sessions
  avoid colliding with you (works at the repo root, no daemon needed).
- Navigate with the `graphify-*` tools (`query_graph`) instead of broad
  scans, and heed graph-freshness warnings: re-read the flagged files.
- Learned a decision, gotcha, or convention? `save_memory` it (1–3 sentences
  + the files it is about). Never secrets or code-derivable facts.
- Near your usage/context limit, or blocked? `create_handoff` (done, pending,
  next step, decisions) — the next agent resumes with `baton resume`.
<!-- /baton:coordination -->

