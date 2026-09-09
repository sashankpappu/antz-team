import { Dimension } from '@prisma/client';
import { ClaimIndex, shorten } from './claim-index';

/**
 * Diagrams, generated from claims.
 *
 * Never from prose, and never omitted. A diagram that cannot be completed is
 * drawn with its holes labelled `?` — a picture with three question marks in
 * it is a far better prompt for an exec than a missing section, and it is
 * honest about what the store does not know.
 */

/** The label used for a hole. Consistent so a reader learns to scan for it. */
export const HOLE = '?';

/**
 * Mermaid node text is fragile: quotes, brackets, pipes and newlines all break
 * the parse, and a broken diagram means the whole render fails to display.
 */
export function label(text: string | null | undefined, fallback = HOLE): string {
  const raw = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return fallback;
  return raw
    .replace(/"/g, '&quot;')
    .replace(/[[\]{}()<>|]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

let counter = 0;
/** Reset node numbering so a render is byte-stable across calls. */
function resetIds(): void {
  counter = 0;
}
function nodeId(prefix: string): string {
  counter += 1;
  return `${prefix}${counter}`;
}

interface Lane {
  actor: string;
  steps: string[];
}

/**
 * Diagram 1 — system context. What talks to what.
 *
 * Reads on the left, writes on the right, the process in the middle, and the
 * place everyone treats as authoritative called out, because "which one wins"
 * is the question a developer asks first.
 */
export function systemContextDiagram(index: ClaimIndex, processName: string): string {
  resetIds();
  const lines: string[] = ['flowchart LR'];

  const reads = index.labels(Dimension.SYSTEMS, 'systems_read');
  const writes = index.labels(Dimension.SYSTEMS, 'systems_written');
  const inputs = index.labels(Dimension.DATA, 'inputs', 3);
  const outputs = index.labels(Dimension.DATA, 'outputs', 3);
  const sor = index.text(Dimension.SYSTEMS, 'system_of_record');
  const method = index.text(Dimension.SYSTEMS, 'integration_method');

  const core = 'PROC';
  lines.push(`  ${core}["${label(processName, 'The process')}"]`);

  lines.push('  subgraph READ["Read from"]');
  if (reads.length === 0) {
    lines.push(`    R0["${HOLE} which systems are read"]`);
  } else {
    reads.forEach((system, i) => lines.push(`    R${i}["${label(system)}"]`));
  }
  lines.push('  end');

  lines.push('  subgraph WRITE["Written to"]');
  if (writes.length === 0) {
    lines.push(`    W0["${HOLE} which systems are written"]`);
  } else {
    writes.forEach((system, i) => lines.push(`    W${i}["${label(system)}"]`));
  }
  lines.push('  end');

  const readEdge = label(inputs[0] ?? null, HOLE);
  const writeEdge = label(outputs[0] ?? null, HOLE);

  if (reads.length === 0) {
    lines.push(`  R0 -->|"${readEdge}"| ${core}`);
  } else {
    reads.forEach((_, i) => lines.push(`  R${i} -->|"${readEdge}"| ${core}`));
  }

  if (writes.length === 0) {
    lines.push(`  ${core} -->|"${writeEdge}"| W0`);
  } else {
    writes.forEach((_, i) => lines.push(`  ${core} -->|"${writeEdge}"| W${i}`));
  }

  lines.push(`  SOR[("Treated as right: ${label(sor)}")]`);
  lines.push(`  ${core} -.-> SOR`);

  lines.push(`  METHOD["Got at today by: ${label(method)}"]`);
  lines.push(`  METHOD -.-> ${core}`);

  return lines.join('\n');
}

function lanesFrom(index: ClaimIndex): Lane[] {
  const initiator = index.text(Dimension.ACTORS, 'initiator');
  const performer = index.text(Dimension.ACTORS, 'performer');
  const approver = index.text(Dimension.ACTORS, 'approver');
  const recipient = index.text(Dimension.ACTORS, 'recipient');

  const trigger = index.text(Dimension.TRIGGERS, 'what_starts_it');
  const frequency = index.text(Dimension.TRIGGERS, 'frequency');
  const inputs = index.labels(Dimension.DATA, 'inputs', 2);
  const logic = index.text(Dimension.DECISION_RULES, 'logic');
  const thresholds = index.text(Dimension.DECISION_RULES, 'thresholds');
  const outputs = index.labels(Dimension.DATA, 'outputs', 2);
  const wait = index.text(Dimension.HANDOFFS, 'wait_states');

  return [
    {
      actor: initiator ? shorten(initiator, 28) : `${HOLE} who kicks it off`,
      steps: [
        trigger ? shorten(trigger, 34) : `${HOLE} what sets it off`,
        frequency ? `Happens: ${shorten(frequency, 24)}` : `${HOLE} how often`,
      ],
    },
    {
      actor: performer ? shorten(performer, 28) : `${HOLE} who does the work`,
      steps: [
        inputs.length ? `Gathers ${inputs.join(', ')}` : `${HOLE} what they need to start`,
        logic ? shorten(logic, 34) : `${HOLE} how the call gets made`,
      ],
    },
    {
      actor: approver ? shorten(approver, 28) : `${HOLE} who signs off`,
      steps: [
        thresholds ? `Checks ${shorten(thresholds, 26)}` : `${HOLE} the cut-off that changes the answer`,
        wait ? `Waits: ${shorten(wait, 26)}` : `${HOLE} where it sits waiting`,
      ],
    },
    {
      actor: recipient ? shorten(recipient, 28) : `${HOLE} who gets the result`,
      steps: [outputs.length ? `Receives ${outputs.join(', ')}` : `${HOLE} what comes out`],
    },
  ];
}

/**
 * Diagram 2a — current state, as a swimlane.
 *
 * Mermaid has no swimlane primitive, so each actor becomes a subgraph and the
 * arrows between them are the handoffs. That is deliberate: the crossings are
 * the interesting part of the picture.
 */
export function currentStateDiagram(index: ClaimIndex): string {
  resetIds();
  const lines: string[] = ['flowchart TD'];
  const lanes = lanesFrom(index);
  const lastOfLane: string[] = [];
  const firstOfLane: string[] = [];

  lanes.forEach((lane, laneIndex) => {
    lines.push(`  subgraph L${laneIndex}["${label(lane.actor)}"]`);
    lane.steps.forEach((step, stepIndex) => {
      const id = `L${laneIndex}S${stepIndex}`;
      lines.push(`    ${id}["${label(step)}"]`);
      if (stepIndex === 0) firstOfLane[laneIndex] = id;
      lastOfLane[laneIndex] = id;
    });
    for (let i = 1; i < lane.steps.length; i += 1) {
      lines.push(`    L${laneIndex}S${i - 1} --> L${laneIndex}S${i}`);
    }
    lines.push('  end');
  });

  // The handoffs. Labelled with how long before someone chases, because that
  // is the number that tells you whether the wait is the actual problem.
  const sla = index.text(Dimension.HANDOFFS, 'sla_at_each');
  const boundary = index.text(Dimension.HANDOFFS, 'team_boundaries');

  for (let i = 1; i < lanes.length; i += 1) {
    const edgeLabel = i === 1 && boundary ? shorten(boundary, 28) : (sla ? shorten(sla, 24) : HOLE);
    lines.push(`  ${lastOfLane[i - 1]} -->|"${label(edgeLabel)}"| ${firstOfLane[i]}`);
  }

  // What goes wrong, and who picks it up.
  const failure = index.text(Dimension.EXCEPTIONS, 'known_failure_modes');
  const catcher = index.text(Dimension.EXCEPTIONS, 'who_catches_it');
  const workaround = index.text(Dimension.EXCEPTIONS, 'current_workaround');

  lines.push(`  FAIL{"${label(failure, `${HOLE} what usually goes wrong`)}"}`);
  lines.push(`  CATCH["${label(catcher, `${HOLE} who notices`)}"]`);
  lines.push(`  WORK["${label(workaround, `${HOLE} what they do about it`)}"]`);
  lines.push(`  ${lastOfLane[1] ?? lastOfLane[0]} -.-> FAIL`);
  lines.push('  FAIL -.-> CATCH');
  lines.push('  CATCH -.-> WORK');

  return lines.join('\n');
}

/**
 * Diagram 2b — target state.
 *
 * Built from the same claims, reorganised around what stays human. Anything
 * the store cannot yet place is a labelled hole: an automated step whose rule
 * nobody has stated is drawn with the rule missing, not drawn as decided.
 */
export function targetStateDiagram(index: ClaimIndex): string {
  resetIds();
  const lines: string[] = ['flowchart TD'];

  const trigger = index.text(Dimension.TRIGGERS, 'what_starts_it');
  const scheduled = index.text(Dimension.TRIGGERS, 'scheduled_vs_event');
  const reads = index.labels(Dimension.SYSTEMS, 'systems_read', 3);
  const writes = index.labels(Dimension.SYSTEMS, 'systems_written', 3);
  const logic = index.text(Dimension.DECISION_RULES, 'logic');
  const escalation = index.text(Dimension.DECISION_RULES, 'escalation_criteria');
  const approver = index.text(Dimension.ACTORS, 'approver');
  const handler = index.text(Dimension.ACTORS, 'exception_handler');
  const success = index.text(Dimension.DONE_CRITERIA, 'success_definition');
  const measure = index.text(Dimension.DONE_CRITERIA, 'measurement');

  lines.push('  subgraph AUTO["Automated"]');
  lines.push(`    T["${label(trigger, `${HOLE} what sets it off`)}"]`);
  lines.push(`    SCHED["${label(scheduled, `${HOLE} clock or event`)}"]`);
  lines.push(
    `    GATHER["Pull ${reads.length ? label(reads.join(', ')) : `${HOLE} from which systems`}"]`,
  );
  lines.push(`    DECIDE{"${label(logic, `${HOLE} how the call gets made`)}"}`);
  lines.push(
    `    WRITE["Write to ${writes.length ? label(writes.join(', ')) : `${HOLE} which systems`}"]`,
  );
  lines.push('  end');

  lines.push('  subgraph HUMAN["Still human"]');
  lines.push(`    APPROVE["${label(approver, `${HOLE} who signs off`)}"]`);
  lines.push(`    EXC["${label(handler, `${HOLE} who picks up the mess`)}"]`);
  lines.push('  end');

  lines.push('  T --> SCHED');
  lines.push('  SCHED --> GATHER');
  lines.push('  GATHER --> DECIDE');
  lines.push(`  DECIDE -->|"clear"| WRITE`);
  lines.push(`  DECIDE -->|"${label(escalation, `${HOLE} when it goes up the chain`)}"| APPROVE`);
  lines.push('  APPROVE --> WRITE');
  lines.push('  DECIDE -.->|"fails"| EXC');
  lines.push('  EXC -.-> WRITE');

  lines.push(`  DONE(["Worked when: ${label(success)}"])`);
  lines.push(`  MEASURE["Measured by: ${label(measure)}"]`);
  lines.push('  WRITE --> DONE');
  lines.push('  DONE -.-> MEASURE');

  return lines.join('\n');
}

/**
 * Diagram 3 — actor map. Who does what to whom.
 *
 * Every one of the five actor slots appears whether it is filled or not, so a
 * missing approver is visible as a gap in the picture rather than as an actor
 * the reader never thinks to look for.
 */
export function actorMapDiagram(index: ClaimIndex): string {
  resetIds();
  const lines: string[] = ['flowchart LR'];

  const roles: [string, string, string][] = [
    ['INIT', 'initiator', 'who kicks it off'],
    ['PERF', 'performer', 'who does the work'],
    ['APPR', 'approver', 'who signs off'],
    ['RECV', 'recipient', 'who gets the result'],
    ['EXCH', 'exception_handler', 'who picks up the mess'],
  ];

  for (const [id, slot, description] of roles) {
    const claim = index.text(Dimension.ACTORS, slot);
    lines.push(`  ${id}["${label(claim, `${HOLE} ${description}`)}"]`);
  }

  const trigger = index.text(Dimension.TRIGGERS, 'what_starts_it');
  const outputs = index.labels(Dimension.DATA, 'outputs', 1);
  const escalation = index.text(Dimension.DECISION_RULES, 'escalation_criteria');
  const failure = index.text(Dimension.EXCEPTIONS, 'known_failure_modes');

  lines.push(`  INIT -->|"${label(trigger, 'starts it')}"| PERF`);
  lines.push(`  PERF -->|"${label(escalation, 'sends for sign-off')}"| APPR`);
  lines.push(`  APPR -->|"approved"| PERF`);
  lines.push(`  PERF -->|"${label(outputs[0] ?? null, 'hands over')}"| RECV`);
  lines.push(`  PERF -.->|"${label(failure, 'when it goes wrong')}"| EXCH`);
  lines.push('  EXCH -.-> RECV');

  const owner = index.text(Dimension.DECISION_RULES, 'rule_owner');
  const acceptance = index.text(Dimension.DONE_CRITERIA, 'acceptance_owner');
  lines.push(`  OWNER["Owns the rules: ${label(owner)}"]`);
  lines.push(`  ACC["Says it is done: ${label(acceptance)}"]`);
  lines.push('  OWNER -.-> APPR');
  lines.push('  ACC -.-> RECV');

  return lines.join('\n');
}

/** How many holes a diagram is carrying. Shown next to it in the render. */
export function countHoles(diagram: string): number {
  return (diagram.match(/\?/g) ?? []).length;
}
