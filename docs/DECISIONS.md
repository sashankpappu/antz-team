# Decisions

The build prompt held four questions back before starting. These are the
answers given, what was built from each, and what is still open. Anything
marked **open** must not be treated as settled by anyone reading the code.

---

## D1 — Latency budget for a voice turn

**Answer: under 800ms, interruptible.**

That rules out a stitched STT → model → TTS chain and points at a
speech-to-speech realtime layer for Phase 2.

Built now:

- `lib/voice/adapter.ts` — the interface a realtime layer implements. Not
  implemented; `VOICE_DRIVER=none` and `getVoiceAdapter()` throws with the
  reason rather than half-working.
- `VOICE_TURN_BUDGET_MS=800` in config, so the budget is a value in the system
  rather than a number in a document.
- The gap cache (`lib/interview/gap-cache.ts`), which is the reason 800ms is
  reachable at all. `nextGap()` is one indexed query — no model call, no
  scoring. Rescoring and question generation run after the turn has been
  answered, in `after()`.

The one place a turn may wait on the completeness engine is the first turn of a
workspace whose cache was never built (`nextGapOrRebuild`). It happens before
any question has been asked, at most once per session.

Phase 1 ships text. Building realtime first would have spent the whole build on
latency and shipped no completeness engine — which the build prompt says
explicitly, and which is still right.

---

## D2 — Where recordings and transcripts may be stored, and for how long

**Answer: local blob or cloud blob, decided in config per deployment before the
link is sent.**

Built as exactly that — a decision an operator makes, never one the app makes
at runtime:

| Setting | Effect |
|---|---|
| `STORAGE_DRIVER=local` | A directory on the app host (`STORAGE_LOCAL_ROOT`). For on-prem deployments where artifacts may not leave the machine. |
| `STORAGE_DRIVER=s3` | Any S3-compatible bucket — AWS, R2, MinIO, Wasabi. Region and endpoint from config, so the deployment decides where material physically sits. Encrypted at rest by default. |
| `STORAGE_DRIVER` unset | Uploads are **refused** with `StorageNotConfiguredError`. There is no default location for customer material. |
| `ARTIFACT_RETENTION_DAYS` | Stamped onto every artifact at upload as `purgeAfter`. `purgeExpiredArtifacts()` hard-deletes raw bytes and extracted text past that horizon. Derived claims survive — they are the requirement. Empty means retain indefinitely, and has to be chosen deliberately. |

**Still open:** nobody has named the actual region or retention window for a
production deployment, and `purgeExpiredArtifacts()` has no scheduler wired to
it. Both are deployment decisions, not code ones, but a real customer
engagement needs them answered and the purge job running.

---

## D3 — Consent for third-party voices in an uploaded recording

**Answer: defer — no audio upload in v1.**

- `INGEST_AUDIO_ENABLED=false`. An audio file is refused with
  `AudioIngestDisabledError`, which says *why* it is off and what would change
  it — not "unsupported file type", because it is not a capability gap.
- `lib/transcription/adapter.ts` defines the interface so that turning audio on
  later is an implementation, not a redesign. Transcribed audio would join the
  existing transcript path.
- Transcripts and chat pastes are accepted, and they carry other people's words
  too, so both require an uploader attestation (`attestConsent`) that is logged
  against the artifact. The API refuses a transcript without it (422).

**Still open — this is a legal question, not a technical one.** Whether an
attestation is sufficient, whether non-primary speakers must be redacted from
stored claims and quotes, and what notice the third parties are owed. Do not
flip `INGEST_AUDIO_ENABLED` until that is answered.

---

## D4 — Auth on the `/admin` seeding view

**Answer: "Remove it."**

Read as *remove the auth gate*, not *remove the seeding view* — seeding is the
entry point to the whole product and the reason there is no cold start, so
removing the view would remove the product. If that reading is wrong, say so
and it comes back out.

So `/admin` and `/api/admin/workspaces` are unauthenticated. **The consequence,
stated plainly: anyone who can reach the host can create a workspace and read
the share link of every existing one, and a share link is the only credential
protecting a customer's session.**

What was done instead of pretending otherwise:

- A red banner on `/admin` says the page is unauthenticated and that it needs
  network controls in front of it before real customer use.
- Share tokens are 24 bytes from a CSPRNG (`randomBytes(24).toString('base64url')`),
  not sequential ids, so a link cannot be guessed even though the list of them
  is not protected.
- `SHARE_LINK_TTL_DAYS` expires unused links; an expired link gets a plain
  explanation rather than a 404.
- A share token is scoped: `/api/w/[token]/gaps/[gapId]` verifies the gap
  belongs to that workspace, so one customer's link cannot touch another's data.

**Recommendation, not a decision:** put `/admin` behind a network boundary (VPN,
IP allowlist, or an authenticating proxy) before the first real engagement. One
env-var shared secret would take an hour if you would rather have it in the app.

---

## Open questions the build prompt did not ask about

Surfaced by building it:

1. **The 12-question budget depends on multi-slot answers.** The ontology has 38
   slots. Twelve answers that each establish one slot reach ~31%, not 80% —
   that is arithmetic, not a ranking failure. 80% within 12 needs each answer to
   establish about three slots, which is what a well-grounded question earns
   ("the planner pulls the shortage list from SAP every Monday and emails
   procurement" fills five). Pinned down in `test/rank.test.ts`. If real
   sessions land nearer one slot per answer, the budget needs revisiting — the
   fix is question grounding, not question order.

2. **"Systems and actors unlock the most, ask them early" and "a COO gets asked
   about handoffs and volumes" pull against each other.** They cannot both win
   the first question. Resolved deliberately: the foundational slots open every
   interview, and role decides the order from there — a COO reaches handoffs at
   question four, a finance head reaches decision rules at five. `ROLE_BOOST_RANGE`
   in `lib/interview/rank.ts` is the dial.

3. **No slot for explicit exclusions.** The ontology records what a process
   does, so nothing captures "and we are deliberately not doing X". The BRD's
   scope table says so rather than implying the right column is a decided
   boundary. Worth a tenth dimension, or a slot on Done-criteria.

4. **Conflict resolution has no UI.** Contradictions are detected, stored and
   rendered in both views, and `Claim.supersededById` exists for an explicit
   resolution — but nothing sets it yet. Phase 3.

5. **No retry for a failed extraction.** If extraction fails the artifact is
   stored but un-extracted, contributing nothing to the spec. `/admin` now flags
   those by filename so they are not silently lost, but re-upload is the only
   fix.
