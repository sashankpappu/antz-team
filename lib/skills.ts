import { GapStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { gapRegister } from '@/lib/interview/gap-cache';
import { renderArchitecture } from '@/lib/render/architecture';
import { renderBrd, renderExecView } from '@/lib/render/brd';
import { generateSummary } from '@/lib/render/prose';
import { ClaimIndex, type RenderClaim } from '@/lib/render/claim-index';
import { table } from '@/lib/render/template';

/**
 * Skills. Slash commands, and discoverable in the UI as buttons rather than
 * hidden behind a syntax an exec would have to be taught.
 */

export type CommandName =
  | '/interview'
  | '/grill-me'
  | '/gaps'
  | '/brd'
  | '/architecture'
  | '/summary';

export interface CommandDef {
  name: CommandName;
  label: string;
  description: string;
  /** False for commands that are not built yet, so the UI can say so. */
  available: boolean;
  /** Where this lands in the build order. */
  phase: 1 | 2 | 3;
}

export const COMMANDS: CommandDef[] = [
  {
    name: '/interview',
    label: 'Interview',
    description: 'Guided, one question at a time. The default.',
    available: true,
    phase: 1,
  },
  {
    name: '/summary',
    label: 'Play it back',
    description: 'The idea as understood so far, for correction.',
    available: true,
    phase: 1,
  },
  {
    name: '/gaps',
    label: 'What is missing',
    description: "What is still open, who owns it, what is blocking.",
    available: true,
    phase: 1,
  },
  {
    name: '/brd',
    label: 'The document',
    description: 'The BRD at whatever completeness it is at, gaps included.',
    available: true,
    phase: 1,
  },
  {
    name: '/architecture',
    label: 'Architecture',
    description: 'Logical components and flows. No technology choices.',
    available: true,
    phase: 1,
  },
  {
    name: '/grill-me',
    label: 'Grill me',
    description: 'Adversarial. Attacks the weakest-evidenced claims.',
    available: false,
    phase: 3,
  },
];

export function findCommand(name: string): CommandDef | undefined {
  return COMMANDS.find((c) => c.name === name);
}

export interface CommandResult {
  kind: 'markdown' | 'interview';
  /** Markdown body for a render, empty for /interview. */
  body: string;
  /** Filename to offer if the user exports this. */
  filename?: string;
}

export class CommandNotAvailableError extends Error {
  constructor(command: CommandDef) {
    super(
      `${command.name} is not built yet — it lands in Phase ${command.phase}. ` +
        `Available now: ${COMMANDS.filter((c) => c.available)
          .map((c) => c.name)
          .join(', ')}.`,
    );
    this.name = 'CommandNotAvailableError';
  }
}

/**
 * Run a skill against a workspace.
 *
 * /brd never refuses because the spec is incomplete. An incomplete document
 * with its holes marked is the point of the product.
 */
export async function runCommand(
  workspaceId: string,
  name: string,
): Promise<CommandResult> {
  const command = findCommand(name);
  if (!command) {
    throw new Error(
      `Unknown command "${name}". Try ${COMMANDS.filter((c) => c.available)
        .map((c) => c.name)
        .join(', ')}.`,
    );
  }
  if (!command.available) throw new CommandNotAvailableError(command);

  switch (command.name) {
    case '/interview':
      return { kind: 'interview', body: '' };

    case '/summary': {
      const [workspace, claims] = await Promise.all([
        prisma.workspace.findUniqueOrThrow({
          where: { id: workspaceId },
          select: { name: true },
        }),
        prisma.claim.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' } }),
      ]);
      const summary = await generateSummary(
        new ClaimIndex(claims as unknown as RenderClaim[]),
        workspace.name,
      );
      return { kind: 'markdown', body: `## What I understood\n\n${summary}` };
    }

    case '/gaps':
      return { kind: 'markdown', body: await renderGaps(workspaceId) };

    case '/brd': {
      const { markdown } = await renderBrd(workspaceId);
      return { kind: 'markdown', body: markdown, filename: 'brd.md' };
    }

    case '/architecture':
      return {
        kind: 'markdown',
        body: await renderArchitecture(workspaceId),
        filename: 'architecture.md',
      };

    default:
      throw new Error(`Unhandled command ${command.name}`);
  }
}

/** The open register: what is missing, who owns it, what is blocking. */
export async function renderGaps(workspaceId: string): Promise<string> {
  const [workspace, gaps] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { overallPct: true, gapsComputedAt: true },
    }),
    gapRegister(workspaceId),
  ]);

  if (gaps.length === 0) {
    return `## What is missing\n\n**${workspace.overallPct}% complete.** Nothing open.`;
  }

  const blocking = gaps.filter((g) => g.blocking);
  const owned = gaps.filter((g) => g.status === GapStatus.OWNED);

  const sections = [
    '## What is missing',
    '',
    `**${workspace.overallPct}% complete** · ${gaps.length} open · ` +
      `${blocking.length} blocking · ${owned.length} handed to someone`,
    '',
    table(
      ['Question', 'Area', 'Owner', 'Blocking'],
      gaps.map((gap) => [
        gap.questionText,
        `${gap.dimension.toLowerCase().replace(/_/g, ' ')} — ${gap.slot.replace(/_/g, ' ')}`,
        gap.ownerName
          ? `${gap.ownerName}${gap.ownerRole ? ` (${gap.ownerRole})` : ''}`
          : gap.status === GapStatus.DEFERRED
            ? 'deferred'
            : '—',
        gap.blocking ? 'Yes' : 'No',
      ]),
    ),
  ];

  return sections.join('\n');
}

export { renderBrd, renderExecView, renderArchitecture };
