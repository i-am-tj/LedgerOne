<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Branch and PR conventions

Use purpose-based branch prefixes for all subsequent work: `feat/`, `fix/`,
`docs/`, `refactor/`, or `test/`. Never use agent prefixes (`codex/`, `claude/`,
`agent/`, `ai/`). Targeted review corrections stay on their existing open PR's
feature branch. S08-C uses `feat/p1-s08c-fd-loan-transactions` and PR title
`feat(S08-C): FD movements and loan principal-interest transactions`.
