<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

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
