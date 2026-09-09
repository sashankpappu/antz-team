# Intake

Self-serve requirement capture. Someone at Antz seeds a workspace with whatever
already exists — a deck, a call transcript, a chat thread — and sends a link. A
business user opens it and has a conversation. At the end there is a BRD a
developer who has never met them can build from.

**Phase 1 is built: the spine, over text.** Voice is Phase 2, `/grill-me` and
conflict resolution are Phase 3. See [`docs/DECISIONS.md`](docs/DECISIONS.md)
for the four questions that were answered before starting, and what is still
open.

---

## Running it

```bash
npm install
cp .env.example .env            # then set DATABASE_URL and ANTHROPIC_API_KEY
npx prisma migrate deploy       # or `migrate dev` on a fresh database
npm run dev                     # http://localhost:3000/admin
```

Seed a workspace at `/admin`, attach what already exists, send the link.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | 97 unit tests. No database, no API key. |
| `npm run smoke` | 59 end-to-end checks against a real database. Needs `DATABASE_URL`; no API key. |
| `npm run typecheck` | `tsc --noEmit` |

`npm run smoke` is the Phase 1 acceptance harness for everything that should be
checkable deterministically — provenance, confidence handling, scoring, ranking,
the gap cache, gap ownership, the retention purge, and all three renders
including their diagrams.
Extraction, question wording, conflict adjudication and prose need a key and are
exercised by a real session.

### Configuration that matters

Storage and retention are decided per deployment, before a link is sent — the
app never picks a location for customer material itself, and refuses uploads if
none is configured. Audio ingest is off. Full table in
[`docs/DECISIONS.md`](docs/DECISIONS.md) D2 and D3.

> **`/admin` is unauthenticated** (D4). Anyone who can reach the host can create
> a workspace and read every share link. Put it behind a network boundary before
> the first real customer engagement.

---

## How it works

```
Ingest ──► Claims ──► Completeness engine ──► Gap cache ──► Interviewer
                │                                              │
                └──────────────► Renders ◄─────────────────────┘
```

```
/app          /admin seeding + review, /w/[token] customer session, /api/*
/lib/ontology nine dimensions, 38 slots, scoring
/lib/claims   extraction, conflict detection, the write path
/lib/interview ranking, question generation, gap cache, turn orchestration
/lib/render   BRD, architecture, Mermaid generators, the fixed templates
/lib/storage  blob storage: local or S3-compatible
/templates    brd.md, architecture.md — sections fixed, order fixed
/scripts      smoke.ts
```

### The store is claims, not chat

A conversation is never the source of truth. Every statement becomes a `Claim`
carrying its source, speaker, timestamp, confidence and a verbatim quote. Turns
and artifacts are kept as evidence. The BRD is a render over claims, and two
renders of the same store are byte-identical.

**A claim with no quote is an inference, and an inference never fills a slot** —
`normaliseConfidence()` forces it to `LOW` however confident the model sounded.
A guess that scores is worse than a gap, because it stops us asking.

### Contradiction flags, never overwrites

If new input conflicts with an existing claim, both survive and a `Conflict`
row points at the pair. Nothing in the write path updates or supersedes an
existing claim. The renders show the disagreement and do not pick a winner.

This runs deeper than the obvious path: at equal confidence the render prefers
the **earliest** claim on a slot, not the newest. Newest-wins would be "last
write wins" wearing a different hat.

### The completeness engine picks the questions

Every question traces back to an ontology slot. The next one is always the
highest-value open slot:

```
blocking_weight × downstream_unlock × (1 − current_confidence) × role_boost
```

`downstream_unlock` is the transitive count of slots a slot makes askable, so
Systems and Actors come out top without being special-cased. A slot is filled
only at medium or high confidence; a dimension scores filled/total; overall is
the mean of the nine dimensions.

Never asks the same slot twice, unless the answer was explicitly ambiguous —
decided from the slot's own confidence rather than a flag someone has to
remember to set.

### The engine never runs inside the interview loop

A turn persists the answer, reads the cached question, and replies. Extraction,
rescoring, re-ranking and question generation all happen in `after()`, once the
response has been flushed. A stale question is fine; a two-second pause is not.

The single exception is the first turn of a workspace whose cache was never
built. That decision is free — scoring and ranking are pure functions over rows
already in hand — and only a genuine cache miss triggers a rebuild, so
"I have no more questions" stays a claim about the ontology rather than about
the cache.

### Never ask what you already know

Question generation is handed everything established, everything merely guessed,
and the customer's own vocabulary. Established facts are marked do-not-ask;
guesses are offered as material for a hypothesis to put up for correction.
Asking about something in their own deck destroys trust instantly.

### "I don't know" is a first-class answer

A button, not a tolerated input. Taking it asks once who would know — name and
role — creates an owned, tracked gap, and moves on. An owned gap is never put
back in the queue.

### Diagrams come from claims, with the holes drawn

Three mandatory diagrams in every render — system context, process swimlane
(current and target), actor map — generated from claims, never from prose. A
diagram that cannot be completed is drawn with its gaps labelled `?` and a count
beside it. A picture with three question marks in it is the fastest way for an
exec to see what is missing; an omitted step reads as a step that does not exist.

### The output template is fixed

`templates/*.md` own the sections and their order. Rendering is pure
substitution and throws rather than emit `{{trigger}}` into a developer's spec.
The model fills five named prose fields and nothing else, so it cannot drop a
section it had nothing to say about, invent one, or reorder them. With no API
key the fields fall back to text assembled from the claims themselves.

### Domain specificity is harvested, not authored

No industry packs. Extraction collects the customer's own system, team, process
and document names onto the workspace, and later questions use those words back
at them. "Does that go into SAP or stay in the shortage tracker?" beats "what is
the system of record?"

---

## Skills

Slash commands, and visible as buttons in the session rather than hidden behind
a syntax an exec would have to be taught.

| Command | Status |
|---|---|
| `/interview` | Built. Guided, one question at a time. |
| `/summary` | Built. The idea played back for correction. |
| `/gaps` | Built. What is open, who owns it, what is blocking. |
| `/brd` | Built. Renders at whatever completeness it is at, gaps included. Never refuses. |
| `/architecture` | Built. Logical components and flows. No technology choices. |
| `/grill-me` | **Phase 3.** Reports that plainly rather than half-working. |

---

## Not built, on purpose

Feasibility verdicts. Effort or cost estimates. Technology recommendations in
the architecture output. Multi-user shared workspaces. Live integrations into
customer systems. Hand-authored industry templates. Customer self-signup.

## Known limitations

Beyond the open questions in [`docs/DECISIONS.md`](docs/DECISIONS.md):

- **The 12-question budget needs multi-slot answers.** 38 slots cannot be
  covered by 12 single-slot answers. 80% within 12 requires each answer to
  establish about three slots. Measured in `test/rank.test.ts`.
- **No slot for explicit exclusions.** The ontology records what a process does,
  not what is deliberately out of scope. The BRD's scope table says so instead
  of implying a decided boundary.
- **A failed extraction has no retry.** The artifact is stored but contributes
  nothing; `/admin` flags those by filename so they are not lost silently.
- **The retention purge has no scheduler.** `purgeExpiredArtifacts()` works and
  is covered by `npm run smoke`, but nothing calls it on a timer yet.
- **PDF extraction is text-layer only.** A scanned deck yields nothing, and no
  OCR is wired in.
