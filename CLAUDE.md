# Vidur — operating brief (CLAUDE.md)

This is the project's source of truth. Build in phases; run the validation gates
and the CEO dogfood script at the end of every phase before moving on.

## Role & principles

Ship working software, not slideware. Minimalist by default — every screen does
one job. **Brain-first:** never call an external API for something the brain
already knows. Every synthesized answer carries citations + an honest "what I
don't know yet" note. Security is not a phase: RBAC, scoping, and "no secrets in
the client" hold from commit #1. At a real fork (cost, data residency, provider),
stop and ask.

## The loop

```
input → capture (gbrain) → brain reads it first → triage (know vs do)
  ├─ KNOW → rests in the brain, resurfaces as recall / prep / a connection
  └─ DO   → spins a gstack sprint → ships → /retro+/learn writes the result
            back into the brain as a "source" → tomorrow's briefing is smarter
```

Integration contract: the gstack working repo is registered as a **gbrain
source**. Sprint artifacts auto-sync into the brain and become queryable; a
sprint's `Think` stage runs a brain-first lookup so the crew never re-solves a
solved problem.

## Architecture

- **Web:** Next.js App Router + React + TS + Tailwind + shadcn-style primitives;
  SSE for live sprint status / streamed `think` answers.
- **BFF:** Next.js route handlers — thin orchestration only. Owns no business
  logic the engines provide; brokers UI ↔ gbrain (MCP) ↔ gstack (Agent SDK).
- **Memory:** gbrain. Team = Postgres + pgvector (Azure Database for PostgreSQL),
  via `gbrain serve --http` (OAuth 2.1, scopes read/write/admin).
- **Execution:** gstack invoked from the BFF via the Claude Agent SDK.
- **Auth:** Auth.js (NextAuth v5), Microsoft Entra ID. Each user maps to a gbrain
  login slice so brain reads are permission-scoped (target: zero cross-user leaks).
- **Jobs:** gbrain Minions (Postgres-native). Nightly cron for enrichment +
  briefing generation.

## Locked decisions (§11)

| Input | Decision |
|-------|----------|
| Name / palette | **Vidur** · §6 tokens |
| Deploy | Azure Container Apps + Azure Database for PostgreSQL + Entra ID |
| Scale | team brain now (Postgres, multi-user scoping) |
| Model | **Opus 4.8** default (`claude-opus-4-8`), cost ceilings per §9 |
| Embeddings | **ZeroEntropy** default; OpenAI / Voyage switchable via config |
| Engines | build both gbrain + gstack fresh |
| Channels | paste + email floor **+ Voice (Twilio) + Teams/WhatsApp**; calendar later |
| Brain hosting | local first → provision push to cloud/on-prem prod |
| Compliance | DPDP + GDPR + SOC 2 (all) |

## Data model (app state is thin; the brain owns knowledge)

`users` · `accounts`/`sessions` (Auth.js) · `inbox_items` · `sprints` ·
`decisions` · `briefings` · `audit_log` (append-only; every brain answer + state
change logged with its source pages).

## RBAC → gbrain scopes (§5)

viewer → `read` · member → `read+write` · admin → `admin`. All brain reads execute
under the signed-in user's scope. Sessions are httpOnly cookies; bearer tokens are
server-to-server only, never in the browser. **Phase 5 hard gate:** a fuzz test
hits every read path as user A and asserts zero rows belonging to user B.

## Build plan & CEO gates

Each phase ends with `npm run typecheck && npm test` **and** the CEO script (you,
role-playing a non-technical exec, completing the scenario with zero terminal use).

- **Phase 0 — Foundation** ✅ Next.js + Tailwind + tokens + shadcn + Auth.js OAuth +
  app shell with the six surfaces. *CEO: one-click sign-in, calm home, no config file.*
- **Phase 1 — Capture + Brain recall** ✅ gbrain wired over MCP (live HTTP client +
  in-memory fallback, degradation-guarded); composer + signal detector; inline
  brain-first recall; Ask/Think box with citations + gap note; raw-search toggle;
  idempotent captures; per-user brain scoping; append-only audit on every answer.
  *CEO: paste an Alice email → recall + open questions; ask → answer + sources + gaps.*
- **Phase 2 — Triage + Execute** ✅ "Start it" spins a sprint (SprintEngine seam:
  simulated engine now, live Agent-SDK engine gated on GSTACK_LIVE); live 7-stage
  board over SSE; parallel sprints; sprint detail (artifacts + log); Think stage
  runs the brain-first lookup (the integration contract). *CEO: tap Start it →
  watch Think→Plan→Design… ship without touching anything.*
- **Phase 3 — Decisions** ✅ Sprints block at a Design fork (taste / security);
  Decisions surface shows the crew's recommendation + one-tap Approve/Adjust/
  Reject; resolving resumes the sprint; nav gold badge = open fork count; forks
  scoped per user. (Gold appears only here.) *CEO: two finalists waiting → tap →
  ships; a security fork in plain English → approve the patch.*
- **Phase 4 — Dream + Briefing** ✅ One-screen briefing (shipped / running /
  holding / what I'd watch) composed from live sprint + decision state + brain
  flags; gbrain `flags()` surfaces contradictions + staleness (find_contradictions
  on the live client); dream cycle run-now + last-run/next-scheduled. *CEO: 7am
  one-screen read; it flags that two notes disagree.*
- **Phase 5 — Graph + Govern.** Knowledge-graph view; team scoping; audit /
  citations; cron visibility. Fuzz-test zero cross-user leaks.

## Definition of done (every phase)

typecheck clean · tests green · no secrets in client bundle · every brain-derived
statement cited + logged to `audit_log` · RBAC/scoping enforced (fuzz-tested at
Phase 5) · Lighthouse a11y ≥ 95, no contrast failures, works one-handed on a phone
· CEO script passes with zero terminal interaction · README updated.

## Guardrails

Data residency / compliance configurable (DPDP / GDPR / SOC 2). Keep PII in the
brain DB, not in logs; audit trail append-only. Cost ceilings on `think`/sprint
runs (surface estimated cost before a long run). Graceful degradation: if gstack
is unreachable, capture + brain still work and sprints queue. Idempotent captures
(dedupe by content hash).

## Design system (§6)

```
--paper:#F7F7F4  --card:#FFFFFF  --ink:#17181C  --muted:#71757E  --line:#E7E6E1
--accent:#3B40C9  --accent-deep:#2E329F  --accent-tint:#EDEEFB
--needs-you:#E0890A  (gold — ONLY for forks that need a human)
--shipped:#0E9F6E
Fonts: Instrument Serif (display) · Inter (UI) · JetBrains Mono (commands/IDs)
Radius 14–20px · soft shadows · hairline borders · generous whitespace · no decorative gradients
```

At most one accent color visible per view. Animations subtle and
`prefers-reduced-motion`-safe. Mobile-first (single column, bottom tab bar).

## Project map (Phase 0)

```
src/
  auth.ts                     NextAuth v5 config (Entra ID + gated dev sign-in)
  middleware.ts               route gate → /login when unauthenticated
  lib/
    nav.ts                    the six surfaces
    rbac.ts                   app role → gbrain scope mapping
    signal-detector.ts        deterministic know/do classifier (+ .test.ts)
    auth-actions.ts           sign-in / sign-out server actions
    store.ts                  thin app state: inbox + append-only audit (+ .test.ts)
    gbrain/
      types.ts                GbrainClient contract (search/think/put_page…)
      mcp-client.ts           live client over MCP Streamable HTTP
      memory-client.ts        seeded in-memory brain + fallback (+ .test.ts)
      index.ts                factory + per-user scoping + degradation guard
    gstack/
      types.ts                SprintEngine contract + 7-stage model
      simulated-engine.ts     timer-driven pipeline; Think = brain lookup (+ .test.ts)
      index.ts                factory + GSTACK_LIVE seam for Agent-SDK engine
  components/
    app-shell.tsx             nav rail + top bar + bottom tabs
    nav-rail.tsx / bottom-tabs.tsx
    surface.tsx               shared surface frame + "Planned" placeholder
    capture-client.tsx        composer + inline recall + inbox stream
    ask-box.tsx               Brain Ask (think) + raw-search toggle
    brain-answer.tsx          answer + citations + "what it doesn't know yet"
    ui/                       button, card
  app/
    login/page.tsx
    (app)/                    authenticated surfaces
      page.tsx                Capture (home)
      brain | execute | decisions | briefing | govern /page.tsx
    api/
      auth/[...nextauth]/route.ts
      capture | think | search | inbox /route.ts   (BFF — thin orchestration)
      sprints/route.ts         start + list sprints
      sprints/[id]/route.ts    sprint detail (artifacts + log)
      sprints/stream/route.ts  SSE — live stage transitions
```

Local infra: `docker-compose.yml` (Postgres + pgvector + pinned `gbrain serve --http`).
