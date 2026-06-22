# Vidur

One executive surface over **gbrain** (a brain that remembers) and **gstack** (a crew that ships).

Vidur is a single place to hand in every input — an idea, an email, a bug, a
decision — and let it flow: capture → the brain reads it first → triage (know vs
do) → either it rests in memory and resurfaces later, or it spins a sprint that
ships and writes the result back into the brain.

> **Status:** Phase 0 (Foundation) complete. The app shell, design system, auth,
> and all six surfaces are scaffolded and runnable. See the build plan in
> [`CLAUDE.md`](./CLAUDE.md).

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

## Decisions locked (from §11)

- **Name:** Vidur · **Palette:** §6 indigo / gold / paper tokens
- **Deploy:** Azure Container Apps + Azure Database for PostgreSQL + Entra ID
- **Scale:** team brain now (Postgres + pgvector, multi-user scoping)
- **Model:** Opus 4.8 default (cost ceilings per §9) · **Embeddings:** ZeroEntropy
- **Engines:** build both gbrain + gstack fresh
- **Channels:** paste + email-forward floor, plus Voice (Twilio) and Teams/WhatsApp
- **Brain hosting:** local first, with a path to cloud/on-prem production
- **Compliance:** DPDP + GDPR + SOC 2
