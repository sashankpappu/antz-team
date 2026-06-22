# Vidur

One executive surface over **gbrain** (a brain that remembers) and **gstack** (a crew that ships).

Vidur is a single place to hand in every input — an idea, an email, a bug, a
decision — and let it flow: capture → the brain reads it first → triage (know vs
do) → either it rests in memory and resurfaces later, or it spins a sprint that
ships and writes the result back into the brain.

> **Status:** All six surfaces shipped (Phases 0–5). Capture + brain-first recall,
> the Brain Ask box + knowledge graph, the live 7-stage Execute board, human-only
> Decision forks, the Dream + Briefing screen, and Govern (scoping, masked config,
> cron, audit). Cross-user isolation is fuzz-tested to zero leaks. See the build
> plan in [`CLAUDE.md`](./CLAUDE.md).

## The six surfaces (§4)

| Surface       | Job                                            | Lights up |
|---------------|------------------------------------------------|-----------|
| **Capture**   | Hand it to Vidur — one composer, one inbox     | Phase 1   |
| **Brain**     | Ask what we know (`think` + citations + graph) | Phase 1·5 |
| **Execute**   | The gstack 7-stage sprint board                | Phase 2   |
| **Decisions** | Human-only forks with the crew's recommendation| Phase 3   |
| **Briefing**  | Dream cycle + morning briefing                 | Phase 4   |
| **Govern**    | Team, brain scoping, audit, config             | Phase 1·5 |

## Stack

- **Next.js 15** (App Router) · React 19 · TypeScript · Tailwind v3
- **Auth.js (NextAuth v5)** — Microsoft Entra ID, with a gated dev sign-in
- Design system per §6 (Instrument Serif / Inter / JetBrains Mono; indigo accent,
  gold reserved only for decision forks)

## Run it

```bash
npm install
cp .env.example .env.local          # then set AUTH_SECRET (see below)
npm run dev                         # http://localhost:3000
```

Generate a secret:

```bash
openssl rand -base64 32             # paste into AUTH_SECRET
```

In pure-local dev you need **only** `AUTH_SECRET` and `AUTH_DEV_MODE=true`. The
"Sign in as CEO (demo)" button then works with no identity provider. To use real
Microsoft sign-in, fill in the `AUTH_MICROSOFT_ENTRA_ID_*` vars and set
`AUTH_DEV_MODE=false`.

### Validation gates

```bash
npm run typecheck   # tsc --noEmit — clean
npm test            # vitest — signal detector unit tests
npm run build       # production build — all routes compile
```

## Environment variables

All secrets are **server-only**; nothing is exposed to the browser. See
[`.env.example`](./.env.example) for the full list. Key ones:

| Var | Purpose |
|-----|---------|
| `AUTH_SECRET` | Auth.js session signing key (required) |
| `AUTH_DEV_MODE` | `true` enables one-click demo sign-in; set `false` anywhere shared |
| `AUTH_MICROSOFT_ENTRA_ID_*` | Entra ID OAuth credentials (real sign-in) |
| `GBRAIN_HTTP_URL` / `GBRAIN_SERVICE_TOKEN` | gbrain memory layer (Phase 1) |
| `GSTACK_STEP_MS` | simulated sprint stage interval (default 1200ms) |
| `GSTACK_LIVE` | `true` selects the live Agent-SDK gstack engine (needs key) |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | model tier — default `claude-opus-4-8` |
| `EMBEDDING_PROVIDER` | `zeroentropy` (default) · `openai` · `voyage` |
| `DATABASE_URL` | Postgres + pgvector (Azure Database for PostgreSQL) |

## CEO demo script — Phase 0

> Goal: "I sign in with one click and land on a calm home screen. I never saw a
> config file." (Zero terminal interaction for the test user.)

1. Open `http://localhost:3000`. You're bounced straight to a calm sign-in screen.
2. Click **Sign in as CEO (demo)**.
3. You land on **Capture** — "Good day, …" with one composer and one primary
   action, *Hand it to Vidur*.
4. The left nav shows all six surfaces. Click through Brain, Execute, Decisions,
   Briefing, Govern — each is a calm, single-job screen describing what it will do.
5. On a phone-width window, the nav collapses to a bottom tab bar (one-handed).
6. Click the sign-out icon (top right) — you return to the sign-in screen.

No gold appears anywhere yet: it is reserved for decision forks (Phase 3).

## CEO demo script — Phase 1

> Goal: "I paste an email about Alice and within seconds Vidur shows what we
> already know about her and what's still open. I ask a question and get an
> answer with sources, and it tells me what it's unsure of."

1. On **Capture**, paste an email, e.g. *"From: alice@acme.com / Subject:
   Partnership pricing — can we finalize the Acme pilot pricing this week?"* and
   click **Hand it to Vidur**.
2. Vidur classifies it (a chip shows kind · route · confidence) and, **before
   storing it**, shows *Here's what you already know* — a synthesized recall with
   numbered **Sources** and a **What the brain doesn't know yet** note (pricing
   not finalized, legal review pending, SOC 2 scope undocumented…).
3. The capture drops into the **Inbox** stream below. Paste it again — Vidur
   recognizes the duplicate (idempotent capture).
4. Go to **Brain**, ask *"What do we know about Alice at Acme and the deal?"* The
   answer arrives with inline citations and the same honest gap note. Toggle
   **Raw search** to see the underlying ranked pages.

Runs out of the box with the built-in in-memory brain (seeded with the Alice /
Acme example). Point it at a real gbrain for live synthesis — see below.

## CEO demo script — Phase 2

> Goal: "I tap 'Start it' on an idea and watch it move Think→Plan→Design without
> me touching anything."

1. On **Capture**, find a DO item in the inbox and tap **Start it** (or go to
   **Execute** and start one directly, e.g. *"Draft the Acme pilot pricing page"*).
2. The sprint appears on the **Execute** board under **Think** and advances
   through Plan → Design → Build → Review → Test → Ship — live, no refresh
   (Server-Sent Events). A green dot shows the stream is live.
3. Click a sprint to see its **artifacts and log**. The first artifact is the
   **brain-first recall** — Think looked the topic up in gbrain (with citations)
   so the crew never re-solves what's already known.
4. Start a second sprint — both run in parallel on the board.

Sprints run on the simulated engine (set `GSTACK_STEP_MS` to speed up/slow down
stage transitions). The live engine drives real gstack via the Claude Agent SDK
behind the same `SprintEngine` interface, gated on `GSTACK_LIVE=true`.

## CEO demo script — Phase 3

> Goal: "Two design finalists are waiting. I tap one and it ships. A security
> fork shows me the risk in plain English and I approve the patch."

1. Start a sprint on **Execute** (e.g. *"Design the Acme pricing page"*). When it
   reaches **Design** it goes **blocked**, and the nav shows a gold count on
   **Decisions** — the one place gold ever appears.
2. Open **Decisions**: a *taste* fork shows two design finalists with the crew's
   recommendation in plain English. Tap **Approve** — the sprint resumes and
   ships.
3. Start a security-flavored sprint (e.g. *"Rotate the leaked auth token"*). Its
   fork is a *security* decision explaining the risk and the patch; approve it
   and the sprint continues.

## CEO demo script — Phase 4

> Goal: "I open Vidur at 7am and read a one-screen briefing of what shipped,
> what's stuck, and what needs me. It flags that two notes disagree."

1. Open **Briefing**. The top row counts shipped / running / holding / captured.
2. Read the sections: **Shipped**, **Running**, **Holding — needs you** (blocked
   sprints + open forks), and **What I'd watch** — contradiction and staleness
   flags from the brain's dream cycle (e.g. "Acme pricing was discussed verbally,
   but the deal note says pricing isn't finalized — these disagree").
3. Tap **Run dream cycle now** to refresh enrichment; the last-run time updates.
   The nightly cron that runs this automatically becomes visible in Govern
   (Phase 5).

## CEO demo script — Phase 5

> Goal: "I ask 'who works at Acme?' and get a real answer from the graph. I add a
> teammate and confirm they can't see my private notes."

1. On **Brain**, scroll to **Knowledge graph**. Entities are grouped by type
   (people / companies / deals). Click **Acme Corp** to see its connections —
   Alice Johnson and the Acme partnership, wired by the brain itself.
2. On **Govern**, see your role, gbrain scopes, and exactly which sources you
   read vs. write; the masked config (model, embeddings, which keys are set —
   never their values); scheduled jobs; compliance (DPDP / GDPR / SOC 2); and the
   append-only audit trail with citations.
3. Isolation is enforced at the data layer and proven by the cross-user fuzz test
   (`npm test`): 200 randomized reads as one user never surface another user's
   private pages across search / think / graph / flags / direct lookup.

## Running the real brain (gbrain)

The architecture: gbrain runs as its **own service** (it's Bun-based, markdown +
Postgres) and Vidur talks to it over MCP. We pin a validated release and run it
containerized; the Vidur app stays a thin client. If the brain is unreachable,
capture and recall **degrade gracefully** to the in-memory brain.

```bash
cp .env.example .env.local          # add ANTHROPIC_API_KEY + ZEROENTROPY_API_KEY
docker compose up -d                # Postgres + pgvector + gbrain serve --http
docker compose exec gbrain gbrain auth create vidur   # copy the token →
#   GBRAIN_SERVICE_TOKEN=...  and  GBRAIN_HTTP_URL=http://localhost:8787  in .env.local
npm run dev
```

With `GBRAIN_HTTP_URL` + `GBRAIN_SERVICE_TOKEN` set, Vidur uses the live engine
(`search` / `think` / `put_page` over MCP); unset, it uses the in-memory brain.
Each signed-in user maps to a gbrain login slice, and reads are scoped to that
user's sources — the foundation for the Phase 5 zero-cross-user-leak fuzz test.

## Decisions locked (from §11)

- **Name:** Vidur · **Palette:** §6 indigo / gold / paper tokens
- **Deploy:** Azure Container Apps + Azure Database for PostgreSQL + Entra ID
- **Scale:** team brain now (Postgres + pgvector, multi-user scoping)
- **Model:** Opus 4.8 default (cost ceilings per §9) · **Embeddings:** ZeroEntropy
- **Engines:** build both gbrain + gstack fresh
- **Channels:** paste + email-forward floor, plus Voice (Twilio) and Teams/WhatsApp
- **Brain hosting:** local first, with a path to cloud/on-prem production
- **Compliance:** DPDP + GDPR + SOC 2
