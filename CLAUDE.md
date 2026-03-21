# ProspectApp — Development Guide

## Stack
- Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- Supabase (PostgreSQL, Auth, Realtime)
- Claude API (claude-sonnet-4-20250514) for AI features
- Gmail API for email sending
- Apollo API for contact enrichment

## Commands
- `npm run dev` — Start dev server (port 3000)
- `npm run build` — Production build (also runs lint + type check)
- `npm run lint` — ESLint check

## Git Workflow
- **Never push directly to main** — always use feature branches + PRs
- Branch naming: `feature/description`, `fix/description`, `chore/description`
- PRs must pass CI (lint + build) before merging
- Write PR descriptions in plain English for non-technical review
- Keep PRs small and focused — one feature or fix per PR

## Code Conventions
- Use shadcn/ui components from `@/components/ui/`
- Use `cn()` from `@/lib/utils` for class merging
- Supabase clients: `@/lib/supabase/client` (browser), `@/lib/supabase/server` (server), `@/lib/supabase/admin` (service role)
- Database types in `@/lib/supabase/types.ts`
- API routes in `src/app/api/`
- Pages use route groups: `(dashboard)` for authenticated pages
- "use client" only when needed (hooks, interactivity)

## Important Files
- `supabase/migrations/` — Database schema (run in Supabase SQL editor)
- `.env.local` — Environment variables (never commit this)
- `src/middleware.ts` — Auth redirect logic
- `src/lib/claude.ts` — Claude API wrapper
- `src/lib/gmail.ts` — Gmail sending + OAuth
- `src/lib/apollo.ts` — Apollo enrichment

## Don't
- Don't commit `.env.local` or any secrets
- Don't modify shadcn/ui component internals unless necessary
- Don't add dependencies without justification
- Don't skip the build check before opening a PR
