import { ConflictStatus, Dimension, GapStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { openSlots as openSlotsOf, score, type Scorecard } from '@/lib/ontology';
import { ClaimIndex, shorten, type RenderClaim } from './claim-index';
import {
  actorMapDiagram,
  countHoles,
  currentStateDiagram,
  systemContextDiagram,
  targetStateDiagram,
} from './mermaid';
import { generateProse, generateSummary, type Prose } from './prose';
import { UNKNOWN, fill, loadTemplate, table } from './template';

export const RENDER_VERSION = 'v0.1';

const DIMENSION_LABEL: Record<Dimension, string> = {
  ACTORS: 'Actors',
  TRIGGERS: 'Triggers',
  SYSTEMS: 'Systems',
  DATA: 'Data',
  DECISION_RULES: 'Decision rules',
  EXCEPTIONS: 'Exceptions',
  HANDOFFS: 'Handoffs',
  VOLUMES: 'Volumes',
  DONE_CRITERIA: 'Done-criteria',
};

const CONFIDENCE_LABEL = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low — inferred' } as const;

export interface RenderBundle {
  workspace: {
    id: string;
    name: string;
    createdBy: string;
    inferredRole: string | null;
    inferredDomain: string | null;
    createdAt: Date;
    status: string;
  };
  claims: RenderClaim[];
  index: ClaimIndex;
  scorecard: Scorecard;
  gaps: {
    id: string;
    dimension: Dimension;
    slot: string;
    questionText: string;
    status: GapStatus;
    ownerName: string | null;
    ownerRole: string | null;
    blocking: boolean;
  }[];
  conflicts: {
    id: string;
    rationale: string | null;
    status: ConflictStatus;
    claimA: { content: string; speaker: string | null; confidence: string };
    claimB: { content: string; speaker: string | null; confidence: string };
  }[];
  artifacts: { id: string; filename: string; kind: string; uploadedAt: Date; uploadedBy: string }[];
  turnCount: number;
}

/** Everything a render needs, in one read. Renders never call the store twice. */
export async function loadRenderBundle(workspaceId: string): Promise<RenderBundle> {
  const [workspace, claims, gaps, conflicts, artifacts, turnCount] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        createdBy: true,
        inferredRole: true,
        inferredDomain: true,
        createdAt: true,
        status: true,
      },
    }),
    prisma.claim.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      include: {
        sourceArtifact: { select: { id: true, filename: true, kind: true, uploadedAt: true } },
        sourceTurn: { select: { id: true, createdAt: true, medium: true } },
      },
    }),
    prisma.gap.findMany({
      where: { workspaceId, status: { not: GapStatus.ANSWERED } },
      orderBy: [{ blocking: 'desc' }, { rank: 'asc' }],
      select: {
        id: true,
        dimension: true,
        slot: true,
        questionText: true,
        status: true,
        ownerName: true,
        ownerRole: true,
        blocking: true,
      },
    }),
    prisma.conflict.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        rationale: true,
        status: true,
        claimA: { select: { content: true, speaker: true, confidence: true } },
        claimB: { select: { content: true, speaker: true, confidence: true } },
      },
    }),
    prisma.artifact.findMany({
      where: { workspaceId },
      orderBy: { uploadedAt: 'asc' },
      select: { id: true, filename: true, kind: true, uploadedAt: true, uploadedBy: true },
    }),
    prisma.turn.count({ where: { workspaceId } }),
  ]);

  const renderClaims = claims as unknown as RenderClaim[];

  return {
    workspace,
    claims: renderClaims,
    index: new ClaimIndex(renderClaims),
    scorecard: score(renderClaims),
    gaps,
    conflicts,
    artifacts,
    turnCount,
  };
}

function actorsTable(index: ClaimIndex): string {
  const rows = [
    ['Who kicks it off', 'initiator'],
    ['Who does the work', 'performer'],
    ['Who signs off', 'approver'],
    ['Who gets the result', 'recipient'],
    ['Who picks up the mess', 'exception_handler'],
  ].map(([label, slot]) => {
    const claim = index.one(Dimension.ACTORS, slot);
    const established = index.text(Dimension.ACTORS, slot);
    return [
      label,
      established ?? (claim ? `${claim.content} — unverified` : UNKNOWN),
      claim?.speaker ?? '—',
      claim ? CONFIDENCE_LABEL[claim.confidence] : '—',
    ];
  });

  return table(['Role in the process', 'Who', 'Named by', 'Confidence'], rows);
}

function scopeTable(bundle: RenderBundle): string {
  const established: string[] = [];
  for (const dimension of bundle.scorecard.dimensions) {
    for (const slot of dimension.slots) {
      if (slot.filled) established.push(`${dimension.label} — ${slot.label}`);
    }
  }

  const unresolved = bundle.gaps
    .filter((g) => g.blocking)
    .map((g) => `${DIMENSION_LABEL[g.dimension]} — ${g.slot.replace(/_/g, ' ')}`);

  const height = Math.max(established.length, unresolved.length, 1);
  const rows: string[][] = [];
  for (let i = 0; i < height; i += 1) {
    rows.push([established[i] ?? '', unresolved[i] ?? '']);
  }

  return [
    table(['Established', 'Blocking and unresolved'], rows),
    '',
    '> The right column is what a developer would have to guess at today. Anything ' +
      'absent from both columns is unestablished, not out of scope — this document ' +
      'records what was said, and nobody has yet stated an exclusion.',
  ].join('\n');
}

function capabilitiesTable(bundle: RenderBundle): string {
  const rows = bundle.claims
    .filter((c) => !c.supersededById)
    .map((claim, i) => {
      const source = claim.sourceArtifact
        ? `${claim.sourceArtifact.filename} (${claim.sourceArtifact.kind.toLowerCase()})`
        : claim.sourceTurn
          ? `live session, ${claim.sourceTurn.medium.toLowerCase()}`
          : 'unknown source';

      return [
        `C${i + 1}`,
        `**${DIMENSION_LABEL[claim.dimension]} · ${claim.slot.replace(/_/g, ' ')}** — ${claim.content}`,
        claim.quote ? `"${shorten(claim.quote, 90)}"` : '_no quote — inferred_',
        `${source}${claim.speaker ? `, ${claim.speaker}` : ''}`,
        CONFIDENCE_LABEL[claim.confidence],
      ];
    });

  if (rows.length === 0) {
    return '_No claims recorded yet. Seed an artifact or run a session._';
  }

  return table(['#', 'What was established', 'Evidence', 'Source', 'Confidence'], rows);
}

function contradictionsSection(bundle: RenderBundle): { body: string; note: string } {
  const open = bundle.conflicts.filter((c) => c.status === ConflictStatus.OPEN);

  if (bundle.conflicts.length === 0) {
    return {
      body:
        '_None recorded._ Contradicting input raises a flag here rather than ' +
        'overwriting what was said before, so an empty section means the sources agree.',
      note: 'No contradictions recorded.',
    };
  }

  const rows = bundle.conflicts.map((conflict, i) => [
    `X${i + 1}`,
    `${conflict.claimA.content}${conflict.claimA.speaker ? ` — ${conflict.claimA.speaker}` : ''}`,
    `${conflict.claimB.content}${conflict.claimB.speaker ? ` — ${conflict.claimB.speaker}` : ''}`,
    conflict.rationale ?? '—',
    conflict.status === ConflictStatus.OPEN ? '**Open**' : 'Resolved',
  ]);

  return {
    body: [
      table(['#', 'One source says', 'Another says', 'Why it matters', 'Status'], rows),
      '',
      '> Both statements are still in the store. Neither was overwritten, and this ' +
        'document does not pick a winner — somebody at the customer has to.',
    ].join('\n'),
    note:
      open.length > 0
        ? `**${open.length} unresolved contradiction${open.length === 1 ? '' : 's'}** — see section 9.`
        : 'All recorded contradictions have been resolved.',
  };
}

function scorecardTable(bundle: RenderBundle): string {
  const gapByDimension = new Map<Dimension, string[]>();
  for (const gap of bundle.gaps) {
    const list = gapByDimension.get(gap.dimension) ?? [];
    list.push(gap.slot.replace(/_/g, ' '));
    gapByDimension.set(gap.dimension, list);
  }

  const rows = bundle.scorecard.dimensions.map((dimension) => [
    dimension.label,
    `${dimension.pct}%`,
    `${dimension.filledSlots}/${dimension.totalSlots}`,
    dimension.openSlots.length === 0
      ? '—'
      : dimension.openSlots.map((s) => s.replace(/_/g, ' ')).join(', '),
  ]);

  rows.push([
    '**Overall**',
    `**${bundle.scorecard.overallPct}%**`,
    `**${bundle.scorecard.filledSlots}/${bundle.scorecard.totalSlots}**`,
    '',
  ]);

  return table(['Dimension', 'Score', 'Slots filled', 'Still open'], rows);
}

function openQuestionsTable(bundle: RenderBundle): string {
  const rows = bundle.gaps.map((gap, i) => [
    `Q${i + 1}`,
    gap.questionText,
    gap.ownerName
      ? `${gap.ownerName}${gap.ownerRole ? ` (${gap.ownerRole})` : ''}`
      : gap.status === GapStatus.DEFERRED
        ? '_deferred, unowned_'
        : '_unassigned_',
    gap.blocking ? '**Yes**' : 'No',
  ]);

  if (rows.length === 0) return '_Nothing open._';
  return table(['#', 'Question', 'Owner', 'Blocking'], rows);
}

function nonFunctionalTable(index: ClaimIndex): string {
  const rows = [
    ['How many, per period', Dimension.VOLUMES, 'transactions_per_period'],
    ['At peak', Dimension.VOLUMES, 'peak'],
    ['Growth', Dimension.VOLUMES, 'growth'],
    ['Size of each', Dimension.VOLUMES, 'size_of_each'],
    ['How long before someone chases', Dimension.HANDOFFS, 'sla_at_each'],
    ['How often it fails today', Dimension.EXCEPTIONS, 'frequency'],
    ['How trusted the input is', Dimension.DATA, 'quality_trust'],
  ] as const;

  return table(
    ['Property', 'Value', 'Confidence'],
    rows.map(([label, dimension, slot]) => {
      const claim = index.one(dimension, slot);
      const established = index.text(dimension, slot);
      return [
        label,
        established ?? (claim ? `${claim.content} — unverified` : UNKNOWN),
        claim ? CONFIDENCE_LABEL[claim.confidence] : '—',
      ];
    }),
  );
}

function provenanceTable(bundle: RenderBundle): string {
  const rows: string[][] = bundle.artifacts.map((artifact) => {
    const contributed = bundle.claims.filter((c) => c.sourceArtifact?.id === artifact.id).length;
    return [
      `${artifact.filename} (${artifact.kind.toLowerCase()})`,
      artifact.uploadedAt.toISOString().slice(0, 10),
      artifact.uploadedBy,
      `${contributed} claim${contributed === 1 ? '' : 's'}`,
    ];
  });

  const fromSession = bundle.claims.filter((c) => c.sourceTurn).length;
  if (fromSession > 0 || bundle.turnCount > 0) {
    rows.push([
      `Live session (${bundle.turnCount} turns)`,
      bundle.workspace.createdAt.toISOString().slice(0, 10),
      bundle.workspace.inferredRole ?? 'business user',
      `${fromSession} claim${fromSession === 1 ? '' : 's'}`,
    ]);
  }

  return table(['Source', 'Date', 'From', 'Contributed'], rows);
}

function diagramNote(diagram: string, what: string): string {
  const holes = countHoles(diagram);
  if (holes === 0) return '';
  return (
    `\n> This ${what} carries **${holes} unanswered point${holes === 1 ? '' : 's'}**, ` +
    `each marked \`?\`. They are drawn rather than hidden: a hole in the picture is ` +
    `the question to ask next, and an omitted step reads as a step that does not exist.`
  );
}

export interface BrdRender {
  markdown: string;
  scorecard: Scorecard;
  prose: Prose;
}

/**
 * The dev render — the full BRD.
 *
 * Self-contained: assumes the reader has never spoken to anyone at the
 * customer. Every capability carries its quote, its source and its confidence,
 * so a stranger can tell what was said from what was guessed.
 */
export async function renderBrd(workspaceId: string): Promise<BrdRender> {
  const bundle = await loadRenderBundle(workspaceId);
  const { index, workspace, scorecard } = bundle;

  const processName = workspace.name;
  const openSlots = openSlotsOf(scorecard);
  const prose = await generateProse(index, processName, openSlots);

  const actorMap = actorMapDiagram(index);
  const currentState = currentStateDiagram(index);
  const targetState = targetStateDiagram(index);
  const systemContext = systemContextDiagram(index, processName);
  const contradictions = contradictionsSection(bundle);

  const blockingCount = bundle.gaps.filter((g) => g.blocking).length;

  const markdown = fill(
    await loadTemplate('brd'),
    {
      title: processName,
      idea: prose.problem.split(/(?<=\.)\s/)[0] ?? processName,
      submittedBy: `${workspace.inferredRole ?? 'Business user'}, seeded by ${workspace.createdBy}`,
      domain: workspace.inferredDomain ?? UNKNOWN,
      capturedFrom: describeSources(bundle),
      status: workspace.status.toLowerCase().replace(/_/g, ' '),
      completenessPct: String(scorecard.overallPct),
      openQuestionCount: String(bundle.gaps.length),
      blockingCount: String(blockingCount),

      problem: prose.problem,
      actorsTable: actorsTable(index),
      actorMapDiagram: actorMap,
      trigger: prose.trigger,
      currentStateDiagram: currentState,
      currentStateNotes: prose.currentStateNotes + diagramNote(currentState, 'swimlane'),
      targetStateDiagram: targetState,
      targetStateNotes: prose.targetStateNotes + diagramNote(targetState, 'target state'),
      systemContextDiagram: systemContext,
      systemContextNotes: prose.systemContextNotes + diagramNote(systemContext, 'system context'),
      scopeTable: scopeTable(bundle),
      capabilitiesTable: capabilitiesTable(bundle),
      contradictions: contradictions.body,
      scorecardTable: scorecardTable(bundle),
      openQuestionsTable: openQuestionsTable(bundle),
      nonFunctional: nonFunctionalTable(index),
      provenanceTable: provenanceTable(bundle),
      contradictionNote: contradictions.note,

      version: RENDER_VERSION,
      claimCount: String(index.claimCount),
      renderedAt: new Date().toISOString().slice(0, 10),
    },
    'brd.md',
  );

  return { markdown, scorecard, prose };
}

function describeSources(bundle: RenderBundle): string {
  const parts = bundle.artifacts.map((a) => `${a.kind.toLowerCase()} "${a.filename}"`);
  if (bundle.turnCount > 0) parts.push(`a ${bundle.turnCount}-turn session`);
  return parts.length > 0 ? parts.join(', ') : 'nothing yet';
}

/**
 * The exec render — the same store, a different question.
 *
 * A developer is asking "can I build this". The exec is asking "did I explain
 * this right", so this leads with the playback, marks the gaps, names the
 * people they nominated, and shows the gauge. No provenance table, no quotes,
 * no confidence column: none of that helps them answer their question.
 */
export async function renderExecView(workspaceId: string): Promise<string> {
  const bundle = await loadRenderBundle(workspaceId);
  const { index, workspace, scorecard } = bundle;

  const summary = await generateSummary(index, workspace.name);
  const actorMap = actorMapDiagram(index);
  const currentState = currentStateDiagram(index);

  const owned = bundle.gaps.filter((g) => g.ownerName);
  const unowned = bundle.gaps.filter((g) => !g.ownerName);
  const openConflicts = bundle.conflicts.filter((c) => c.status === ConflictStatus.OPEN);

  const sections: string[] = [
    `# ${workspace.name}`,
    '',
    `**${scorecard.overallPct}% complete** · ${bundle.gaps.length} open · ` +
      `${bundle.gaps.filter((g) => g.blocking).length} blocking`,
    '',
    '## What I understood',
    '',
    summary,
    '',
    '## Who is involved',
    '',
    '```mermaid',
    actorMap,
    '```',
    '',
    '## How it runs today',
    '',
    '```mermaid',
    currentState,
    '```',
    '',
    `Anything marked \`?\` is something I still do not know.`,
    '',
    '## Where we are',
    '',
    table(
      ['Area', 'Complete', 'What I still need'],
      scorecard.dimensions.map((d) => [
        d.label,
        `${d.pct}%`,
        d.openSlots.length === 0
          ? 'Nothing'
          : d.openSlots.map((s) => s.replace(/_/g, ' ')).join(', '),
      ]),
    ),
  ];

  if (unowned.length > 0) {
    sections.push(
      '',
      '## Still open, nobody named',
      '',
      table(
        ['Question', 'Blocking'],
        unowned.map((g) => [g.questionText, g.blocking ? 'Yes' : 'No']),
      ),
    );
  }

  if (owned.length > 0) {
    sections.push(
      '',
      '## Handed to someone',
      '',
      table(
        ['Question', 'Who you named'],
        owned.map((g) => [
          g.questionText,
          `${g.ownerName}${g.ownerRole ? ` (${g.ownerRole})` : ''}`,
        ]),
      ),
    );
  }

  if (openConflicts.length > 0) {
    sections.push(
      '',
      '## Two answers that disagree',
      '',
      'I kept both. One of these needs a decision from your side.',
      '',
      table(
        ['One says', 'The other says'],
        openConflicts.map((c) => [
          `${c.claimA.content}${c.claimA.speaker ? ` — ${c.claimA.speaker}` : ''}`,
          `${c.claimB.content}${c.claimB.speaker ? ` — ${c.claimB.speaker}` : ''}`,
        ]),
      ),
    );
  }

  return sections.join('\n');
}
