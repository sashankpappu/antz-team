import { Dimension } from '@prisma/client';
import { UNKNOWN, fill, loadTemplate, table } from './template';
import { countHoles, label, systemContextDiagram } from './mermaid';
import { loadRenderBundle } from './brd';
import { RENDER_VERSION } from './brd';
import type { ClaimIndex } from './claim-index';

/**
 * Logical architecture. Components and flows only.
 *
 * No technology choices in v1 — not a database, not a queue, not a vendor.
 * That is not modesty: a stack named in a handoff spec gets built, and nobody
 * has decided this one. Every component here is named for what it does.
 */

function componentsTable(index: ClaimIndex): string {
  const reads = index.labels(Dimension.SYSTEMS, 'systems_read', 6);
  const writes = index.labels(Dimension.SYSTEMS, 'systems_written', 6);
  const sor = index.text(Dimension.SYSTEMS, 'system_of_record');
  const logic = index.text(Dimension.DECISION_RULES, 'logic');
  const handler = index.text(Dimension.ACTORS, 'exception_handler');
  const approver = index.text(Dimension.ACTORS, 'approver');

  const rows: string[][] = [
    [
      'Source of the work',
      index.text(Dimension.TRIGGERS, 'what_starts_it') ?? UNKNOWN,
      'Detects that there is something to do',
    ],
    [
      'Readers',
      reads.length ? reads.join(', ') : UNKNOWN,
      'Fetch what is needed to make the decision',
    ],
    [
      'Decision step',
      logic ?? UNKNOWN,
      'Applies the rule the business owns',
    ],
    [
      'Approval step',
      approver ?? UNKNOWN,
      'Human sign-off where the rule says one is needed',
    ],
    [
      'Writers',
      writes.length ? writes.join(', ') : UNKNOWN,
      'Record the outcome where the business looks for it',
    ],
    [
      'Authority',
      sor ?? UNKNOWN,
      'The record everyone treats as right when two disagree',
    ],
    [
      'Exception path',
      handler ?? UNKNOWN,
      'Where work goes when the rule cannot decide',
    ],
  ];

  return table(['Component', 'What it is, in their words', 'Responsibility'], rows);
}

function flowDiagram(index: ClaimIndex): string {
  const lines: string[] = ['flowchart LR'];

  const trigger = index.text(Dimension.TRIGGERS, 'what_starts_it');
  const inputs = index.labels(Dimension.DATA, 'inputs', 3);
  const logic = index.text(Dimension.DECISION_RULES, 'logic');
  const outputs = index.labels(Dimension.DATA, 'outputs', 3);
  const escalation = index.text(Dimension.DECISION_RULES, 'escalation_criteria');
  const failure = index.text(Dimension.EXCEPTIONS, 'known_failure_modes');

  lines.push(`  A["${label(trigger, '? what sets it off')}"]`);
  lines.push(`  B["Collect ${inputs.length ? label(inputs.join(', ')) : '? what is needed'}"]`);
  lines.push(`  C{"${label(logic, '? how the call gets made')}"}`);
  lines.push(`  D["Record ${outputs.length ? label(outputs.join(', ')) : '? what comes out'}"]`);
  lines.push(`  E["Human sign-off"]`);
  lines.push(`  F["Exception handling"]`);

  lines.push('  A --> B');
  lines.push('  B --> C');
  lines.push('  C -->|"decided"| D');
  lines.push(`  C -->|"${label(escalation, '? when it goes up the chain')}"| E`);
  lines.push('  E --> D');
  lines.push(`  C -.->|"${label(failure, '? what usually goes wrong')}"| F`);
  lines.push('  F -.-> D');

  return lines.join('\n');
}

function dataTable(index: ClaimIndex): string {
  const rows = [
    ['In', Dimension.DATA, 'inputs'],
    ['Out', Dimension.DATA, 'outputs'],
    ['Lives today in', Dimension.DATA, 'where_it_lives_today'],
    ['Arrives as', Dimension.DATA, 'format'],
    ['How trusted', Dimension.DATA, 'quality_trust'],
  ] as const;

  return table(
    ['Direction', 'What', 'Confidence'],
    rows.map(([direction, dimension, slot]) => {
      const claims = index.all(dimension, slot);
      const established = index.established(dimension, slot);
      return [
        direction,
        established.length
          ? established.map((c) => c.content).join('; ')
          : claims.length
            ? `${claims[0].content} — unverified`
            : UNKNOWN,
        established.length ? 'Established' : claims.length ? 'Inferred only' : '—',
      ];
    }),
  );
}

function decisionTable(index: ClaimIndex): string {
  const rows = [
    ['The rule', Dimension.DECISION_RULES, 'logic'],
    ['Who owns it', Dimension.DECISION_RULES, 'rule_owner'],
    ['Numbers in it', Dimension.DECISION_RULES, 'thresholds'],
    ['When it escalates', Dimension.DECISION_RULES, 'escalation_criteria'],
  ] as const;

  return table(
    ['Decision point', 'What was established'],
    rows.map(([labelText, dimension, slot]) => [
      labelText,
      index.text(dimension, slot) ?? UNKNOWN,
    ]),
  );
}

function exceptionTable(index: ClaimIndex): string {
  const rows = [
    ['Known failure', Dimension.EXCEPTIONS, 'known_failure_modes'],
    ['Workaround today', Dimension.EXCEPTIONS, 'current_workaround'],
    ['Who notices', Dimension.EXCEPTIONS, 'who_catches_it'],
    ['How often', Dimension.EXCEPTIONS, 'frequency'],
  ] as const;

  return table(
    ['Failure handling', 'What was established'],
    rows.map(([labelText, dimension, slot]) => [
      labelText,
      index.text(dimension, slot) ?? UNKNOWN,
    ]),
  );
}

function volumeTable(index: ClaimIndex): string {
  const rows = [
    ['Per period', Dimension.VOLUMES, 'transactions_per_period'],
    ['Peak', Dimension.VOLUMES, 'peak'],
    ['Growth', Dimension.VOLUMES, 'growth'],
    ['Size of each', Dimension.VOLUMES, 'size_of_each'],
  ] as const;

  return table(
    ['Load', 'What was established'],
    rows.map(([labelText, dimension, slot]) => [
      labelText,
      index.text(dimension, slot) ?? UNKNOWN,
    ]),
  );
}

export async function renderArchitecture(workspaceId: string): Promise<string> {
  const bundle = await loadRenderBundle(workspaceId);
  const { index, scorecard, workspace } = bundle;

  const systemContext = systemContextDiagram(index, workspace.name);
  const flow = flowDiagram(index);

  const unknowns = bundle.scorecard.dimensions
    .filter((d) => d.openSlots.length > 0)
    .map(
      (d) =>
        `- **${d.label}** (${d.pct}%): ${d.openSlots.map((s) => s.replace(/_/g, ' ')).join(', ')}`,
    );

  return fill(
    await loadTemplate('architecture'),
    {
      title: workspace.name,
      completenessPct: String(scorecard.overallPct),
      blockingCount: String(bundle.gaps.filter((g) => g.blocking).length),
      claimCount: String(index.claimCount),

      systemContextDiagram: systemContext,
      systemContextNotes:
        countHoles(systemContext) > 0
          ? `\`?\` marks a component nobody has named yet — ${countHoles(systemContext)} of them.`
          : 'Every component in this diagram is named in the claims.',

      componentsTable: componentsTable(index),
      flowDiagram: flow,
      flowNotes:
        countHoles(flow) > 0
          ? `${countHoles(flow)} step${countHoles(flow) === 1 ? '' : 's'} in this flow is ` +
            `undecided. Drawn anyway: an undecided step is still a step.`
          : 'Every step in this flow is grounded in a claim.',

      dataTable: dataTable(index),
      decisionTable: decisionTable(index),
      exceptionTable: exceptionTable(index),
      volumeTable: volumeTable(index),

      unknowns: unknowns.length
        ? [
            'These are the parts of the architecture the store cannot yet describe. ' +
              'They are not design choices left open on purpose — they are things ' +
              'nobody has said yet.',
            '',
            ...unknowns,
          ].join('\n')
        : 'Every dimension of the ontology is filled. Nothing is missing at this level.',

      version: RENDER_VERSION,
      renderedAt: new Date().toISOString().slice(0, 10),
    },
    'architecture.md',
  );
}
