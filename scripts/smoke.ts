/**
 * End-to-end check of the Phase 1 spine against a real database.
 *
 * Runs the whole path a session takes — seed a workspace, land claims with
 * provenance, score, rank, fill the gap cache, take a turn, hand a gap to a
 * named colleague, then render all three documents — and asserts the things
 * that would make the product wrong if they broke.
 *
 * Deliberately runs with no ANTHROPIC_API_KEY. Everything here is the
 * deterministic half: scoring, ranking, the cache, provenance and the fixed
 * templates. That is what should be checkable without spending money or
 * depending on a model's mood. Claim extraction, question wording, conflict
 * adjudication and prose need a key and are exercised by a real session.
 *
 *   npm run smoke     (DATABASE_URL must point at a database you can migrate)
 */
import { ArtifactKind, Confidence, Dimension, GapStatus } from '@prisma/client';
import { prisma } from '../lib/db';
import { storeClaims } from '../lib/claims/store';
import { purgeExpiredArtifacts } from '../lib/ingest';
import type { Extraction } from '../lib/claims/schemas';
import {
  assignGapOwner,
  gapRegister,
  nextGap,
  refreshGapCache,
} from '../lib/interview/gap-cache';
import { handleTurn } from '../lib/interview/turn';
import { renderArchitecture } from '../lib/render/architecture';
import { renderBrd, renderExecView } from '../lib/render/brd';
import { runCommand } from '../lib/skills';
import { createWorkspace } from '../lib/workspace';

let failures = 0;

function check(what: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ok   ${what}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${what}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

/**
 * What extraction would have returned from a seeded deck and call transcript.
 * Hand-written so the run is deterministic; the shape is exactly what
 * extractClaims produces.
 */
const DECK_EXTRACTION: Extraction = {
  inferredRole: 'Chief Operating Officer',
  inferredDomain: 'discrete manufacturing',
  vocabulary: [
    { term: 'shortage tracker', kind: 'system' },
    { term: 'SAP', kind: 'system' },
    { term: 'the Monday list', kind: 'document' },
    { term: 'materials planner', kind: 'role' },
  ],
  claims: [
    {
      dimension: Dimension.ACTORS,
      slot: 'performer',
      content: 'The materials planner',
      quote: 'the materials planner works the shortage list',
      speaker: null,
      confidence: 'high',
    },
    {
      dimension: Dimension.SYSTEMS,
      slot: 'systems_read',
      content: 'the shortage tracker',
      quote: 'pulled from the shortage tracker',
      speaker: null,
      confidence: 'high',
    },
    {
      dimension: Dimension.SYSTEMS,
      slot: 'systems_written',
      content: 'SAP',
      quote: 'the order goes into SAP',
      speaker: null,
      confidence: 'high',
    },
    {
      dimension: Dimension.TRIGGERS,
      slot: 'what_starts_it',
      content: 'the Monday list lands',
      quote: 'every Monday the list lands',
      speaker: null,
      confidence: 'high',
    },
    {
      // No quote: an inference. Must come out LOW and must not fill the slot.
      dimension: Dimension.VOLUMES,
      slot: 'transactions_per_period',
      content: 'probably a few hundred a week',
      quote: '',
      speaker: null,
      confidence: 'high',
    },
  ],
};

const TRANSCRIPT_EXTRACTION: Extraction = {
  inferredRole: null,
  inferredDomain: null,
  vocabulary: [{ term: 'procurement', kind: 'team' }],
  claims: [
    {
      dimension: Dimension.HANDOFFS,
      slot: 'team_boundaries',
      content: 'It leaves planning and lands with procurement',
      quote: 'then it goes over to procurement',
      speaker: 'Ravi (planning)',
      confidence: 'high',
    },
    {
      dimension: Dimension.EXCEPTIONS,
      slot: 'known_failure_modes',
      content: 'The tracker is out of date by the time anyone looks',
      quote: 'half the time the tracker is already stale',
      speaker: 'Meera (procurement)',
      confidence: 'medium',
    },
  ],
};

async function main(): Promise<void> {
  console.log('Intake — Phase 1 spine check\n');

  section('Seeding');
  const workspace = await createWorkspace({
    name: 'Shortage escalation, Acme Manufacturing',
    createdBy: 'smoke@antz',
  });
  check('workspace created with a share link', workspace.shareUrl.includes('/w/'));
  check('share token is long enough to be unguessable', workspace.shareToken.length >= 30);

  const deck = await prisma.artifact.create({
    data: {
      workspaceId: workspace.id,
      kind: ArtifactKind.DECK,
      filename: 'shortage-escalation.pptx',
      rawText: 'the materials planner works the shortage list pulled from the shortage tracker',
      uploadedBy: 'smoke@antz',
    },
  });

  const transcript = await prisma.artifact.create({
    data: {
      workspaceId: workspace.id,
      kind: ArtifactKind.TRANSCRIPT,
      filename: 'discovery-call.vtt',
      rawText: 'Ravi (planning): then it goes over to procurement',
      uploadedBy: 'smoke@antz',
    },
  });

  const fromDeck = await storeClaims({
    workspaceId: workspace.id,
    extraction: DECK_EXTRACTION,
    sourceArtifactId: deck.id,
  });
  const fromTranscript = await storeClaims({
    workspaceId: workspace.id,
    extraction: TRANSCRIPT_EXTRACTION,
    sourceArtifactId: transcript.id,
  });

  check('claims stored from both artifacts', fromDeck.created.length + fromTranscript.created.length === 7);
  check('no claim was rejected', fromDeck.rejected + fromTranscript.rejected === 0);

  section('Provenance and confidence');
  const inferred = await prisma.claim.findFirst({
    where: { workspaceId: workspace.id, slot: 'transactions_per_period' },
  });
  check(
    'an unquoted claim is forced to LOW however sure the model sounded',
    inferred?.confidence === Confidence.LOW,
    `got ${inferred?.confidence}`,
  );

  const speaker = await prisma.claim.findFirst({
    where: { workspaceId: workspace.id, slot: 'team_boundaries' },
  });
  check('the speaker who said it is on the claim', speaker?.speaker === 'Ravi (planning)');

  const orphans = await prisma.claim.count({
    where: { workspaceId: workspace.id, sourceArtifactId: null, sourceTurnId: null },
  });
  check('every claim points at a source', orphans === 0, `${orphans} claims with no source`);

  const context = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspace.id },
    select: { inferredRole: true, vocabulary: true },
  });
  check('role was inferred from the seeded material', context.inferredRole === 'Chief Operating Officer');
  check(
    "the customer's own vocabulary was harvested",
    JSON.stringify(context.vocabulary).includes('shortage tracker'),
  );

  section('Scoring and the gap cache');
  const refreshed = await refreshGapCache(workspace.id);
  check('scoring produced a non-zero completeness', refreshed.scorecard.overallPct > 0);
  check(
    'the inferred claim did not fill its slot',
    refreshed.scorecard.dimensions.find((d) => d.dimension === Dimension.VOLUMES)?.pct === 0,
  );
  check('the cache was filled', refreshed.cached > 0);

  const cached = await nextGap(workspace.id);
  check('there is a next question ready to ask', Boolean(cached?.questionText));
  check(
    'it is not about something already established',
    cached?.slot !== 'systems_read' && cached?.slot !== 'performer',
    `asked about ${cached?.dimension}.${cached?.slot}`,
  );

  const scores = await prisma.score.count({ where: { workspaceId: workspace.id } });
  check('all nine dimensions were scored', scores === 9, `${scores} scored`);

  section('A turn');
  const started = await handleTurn({ workspaceId: workspace.id, kind: 'start' });
  check('the reply came back with a question', Boolean(started.response.question));
  check('the gauge came back with it', typeof started.response.completeness === 'number');
  await started.deferred();

  const askedGap = started.response.question!.gapId;

  section("I don't know");
  const owned = await assignGapOwner(askedGap, { name: 'Ravi Kumar', role: 'IT' });
  check('the gap is owned, not lost', owned.status === GapStatus.OWNED);
  check('the person named is recorded', owned.ownerName === 'Ravi Kumar');

  await refreshGapCache(workspace.id);
  const stillAsked = await prisma.gap.findFirst({
    where: { workspaceId: workspace.id, id: askedGap },
  });
  check('an owned gap is never put back in the queue', stillAsked?.status === GapStatus.OWNED);

  const register = await gapRegister(workspace.id);
  check('the register still shows it, with its owner', register.some((g) => g.id === askedGap));

  section('Renders');
  const { markdown, scorecard } = await renderBrd(workspace.id);

  check('no unfilled placeholder reached the document', !markdown.includes('{{'));
  for (const heading of [
    '## 1. Problem',
    '## 2. Actors',
    '## 3. Trigger',
    '## 4. Current state',
    '## 5. Target state',
    '## 6. System context',
    '## 7. Scope',
    '## 8. Core capabilities',
    '## 9. Contradictions',
    '## 10. Completeness scorecard',
    '## 11. Open questions',
    '## 12. Non-functional',
    '## 13. Provenance',
  ]) {
    check(`section present: ${heading}`, markdown.includes(heading));
  }

  const diagrams = (markdown.match(/```mermaid/g) ?? []).length;
  check('all four diagrams rendered', diagrams === 4, `${diagrams} found`);
  check('holes are drawn, not omitted', markdown.includes('?'));

  check('the deck is credited by name', markdown.includes('shortage-escalation.pptx'));
  check('a quote backs an established claim', markdown.includes('pulled from the shortage tracker'));
  check('the inference is marked as one', markdown.includes('_no quote — inferred_'));
  check('the completeness gauge matches the scorecard', markdown.includes(`${scorecard.overallPct}%`));
  check('the owner is named in the open questions', markdown.includes('Ravi Kumar'));

  const execView = await renderExecView(workspace.id);
  check('the exec render leads with the playback', execView.includes('## What I understood'));
  check('the exec render names who they handed things to', execView.includes('Ravi Kumar'));
  check('the exec render carries no provenance table', !execView.includes('## 13. Provenance'));

  const architecture = await renderArchitecture(workspace.id);
  check('the architecture rendered', architecture.includes('## 2. Logical components'));
  check('no placeholder reached it', !architecture.includes('{{'));
  check(
    'it names no technology',
    !/\b(postgres|kafka|redis|lambda|kubernetes|node\.js|react)\b/i.test(architecture),
  );

  const gaps = await runCommand(workspace.id, '/gaps');
  check('/gaps lists the register', gaps.body.includes('What is missing'));

  const grill = await runCommand(workspace.id, '/grill-me').then(
    () => 'ran',
    (error: Error) => error.message,
  );
  check('/grill-me says it is Phase 3 rather than half-working', grill.includes('Phase 3'));

  section('Retention purge');
  const stale = await prisma.artifact.create({
    data: {
      workspaceId: workspace.id,
      kind: ArtifactKind.DOC,
      filename: 'old-notes.txt',
      rawText: 'something a customer sent a long time ago',
      uploadedBy: 'smoke@antz',
      purgeAfter: new Date(Date.now() - 86_400_000),
    },
  });
  const staleClaims = await storeClaims({
    workspaceId: workspace.id,
    extraction: {
      inferredRole: null,
      inferredDomain: null,
      vocabulary: [],
      claims: [
        {
          dimension: Dimension.DONE_CRITERIA,
          slot: 'success_definition',
          content: 'Nothing sits unapproved for more than a day',
          quote: 'nothing should sit for more than a day',
          speaker: null,
          confidence: 'high',
        },
      ],
    },
    sourceArtifactId: stale.id,
  });
  check('a claim was derived from the stale artifact', staleClaims.created.length === 1);

  const purged = await purgeExpiredArtifacts();
  check('the expired artifact was purged', purged === 1, `purged ${purged}`);

  const afterPurge = await prisma.artifact.findUniqueOrThrow({ where: { id: stale.id } });
  check('its raw text is gone', afterPurge.rawText === '');
  check('its blob pointer is gone', afterPurge.storageKey === null);

  const survivor = await prisma.claim.findUnique({ where: { id: staleClaims.created[0].id } });
  check('the derived claim survives the purge — it is the requirement', survivor !== null);
  check('and it still names its source', survivor?.sourceArtifactId === stale.id);

  const fresh = await prisma.artifact.findUniqueOrThrow({ where: { id: deck.id } });
  check('an in-window artifact is untouched', fresh.rawText.length > 0);

  await refreshGapCache(workspace.id);

  section('Renders are deterministic');
  // Both taken now, back to back: the store must not have moved between them,
  // or this measures the store changing rather than the render being stable.
  const first = await renderBrd(workspace.id);
  const second = await renderBrd(workspace.id);
  check('two renders of the same store agree', first.markdown === second.markdown);
  check('and the store did move earlier, so this is not comparing nothing', markdown !== first.markdown);

  console.log(
    `\n${failures === 0 ? 'PASS' : `FAIL — ${failures} check${failures === 1 ? '' : 's'} failed`}` +
      ` · completeness ${scorecard.overallPct}% · ${(await prisma.claim.count({ where: { workspaceId: workspace.id } }))} claims`,
  );

  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
