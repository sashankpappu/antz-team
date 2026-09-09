'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Markdown } from '@/components/markdown';

interface Gap {
  id: string;
  dimension: string;
  slot: string;
  question: string;
  status: string;
  ownerName: string | null;
  ownerRole: string | null;
  blocking: boolean;
}

interface Turn {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
}

interface CommandDef {
  name: string;
  label: string;
  description: string;
  available: boolean;
  phase: number;
}

interface State {
  workspace: { name: string; overallPct: number; status: string };
  scores: { dimension: string; pct: number }[];
  gaps: Gap[];
  nextQuestion: { gapId: string; question: string; blocking: boolean } | null;
  turns: Turn[];
  artifacts: { id: string; filename: string; kind: string }[];
  openConflicts: number;
  commands: CommandDef[];
}

const DIMENSION_LABEL: Record<string, string> = {
  ACTORS: 'Who',
  TRIGGERS: 'What starts it',
  SYSTEMS: 'Systems',
  DATA: 'Information',
  DECISION_RULES: 'Decisions',
  EXCEPTIONS: 'When it fails',
  HANDOFFS: 'Handoffs',
  VOLUMES: 'Volumes',
  DONE_CRITERIA: 'Done',
};

export function Session({ token, workspaceName }: { token: string; workspaceName: string }) {
  const [state, setState] = useState<State | null>(null);
  const [answer, setAnswer] = useState('');
  const [question, setQuestion] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<{ title: string; body: string } | null>(null);
  const [ownerPrompt, setOwnerPrompt] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState('');
  const [ownerRole, setOwnerRole] = useState('');

  const answerRef = useRef<HTMLTextAreaElement>(null);

  const loadState = useCallback(async () => {
    const response = await fetch(`/api/w/${token}/state`);
    if (!response.ok) return;
    const data: State = await response.json();
    setState(data);
    setQuestion((current) => current ?? data.nextQuestion?.question ?? null);
  }, [token]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  async function send(payload: Record<string, unknown>) {
    setThinking(true);
    setError(null);
    try {
      const response = await fetch(`/api/w/${token}/turn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Something went wrong.');

      setQuestion(data.reply);
      setOwnerPrompt(data.awaitingOwnerForGapId);
      setAnswer('');
      setDoc(null);

      // The reply came from the cache. Rescoring is happening behind us, so the
      // gauge is read a moment later rather than blocking the answer.
      setTimeout(() => void loadState(), 1500);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setThinking(false);
      answerRef.current?.focus();
    }
  }

  async function runCommand(name: string) {
    if (name === '/interview') {
      setDoc(null);
      return;
    }
    setThinking(true);
    setError(null);
    try {
      const response = await fetch(`/api/w/${token}/command`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command: name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Could not run that.');
      const label = state?.commands.find((c) => c.name === name)?.label ?? name;
      setDoc({ title: label, body: data.body });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setThinking(false);
    }
  }

  const pct = state?.workspace.overallPct ?? 0;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{workspaceName}</h1>
          <p className="mt-0.5 text-xs text-ink-soft">
            {state
              ? `${state.artifacts.length} thing${state.artifacts.length === 1 ? '' : 's'} you already sent · ${state.gaps.length} still open`
              : 'Loading what we already know…'}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">{pct}%</div>
          <div className="text-xs text-ink-soft">understood</div>
        </div>
      </header>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full bg-accent transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <nav className="mt-5 flex flex-wrap gap-2">
        {(state?.commands ?? []).map((command) => (
          <button
            key={command.name}
            type="button"
            onClick={() => void runCommand(command.name)}
            disabled={!command.available || thinking}
            title={
              command.available
                ? command.description
                : `${command.description} — not built yet (Phase ${command.phase})`
            }
            className="rounded-full border border-line bg-white px-3 py-1 text-xs disabled:opacity-40"
          >
            {command.label}
          </button>
        ))}
      </nav>

      {doc ? (
        <section className="mt-6 rounded-lg border border-line bg-white p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
              {doc.title}
            </h2>
            <button
              type="button"
              onClick={() => setDoc(null)}
              className="text-xs underline"
            >
              back to the questions
            </button>
          </div>
          <div className="mt-4">
            <Markdown source={doc.body} />
          </div>
          <div className="mt-5 flex gap-3 border-t border-line pt-3 text-xs">
            <a href={`/api/w/${token}/render?view=brd&download=1`} className="underline">
              download the document
            </a>
            <a href={`/api/w/${token}/render?view=exec&download=1`} className="underline">
              download the summary
            </a>
          </div>
        </section>
      ) : (
        <section className="mt-6">
          <div className="rounded-lg border border-line bg-white p-6">
            {question ? (
              <p className="text-lg leading-relaxed">{question}</p>
            ) : (
              <p className="text-lg leading-relaxed text-ink-soft">
                {state
                  ? 'Ready when you are.'
                  : 'One moment — reading what you already sent.'}
              </p>
            )}

            {state?.nextQuestion?.blocking && !doc && (
              <p className="mt-2 text-xs text-flag">
                A developer cannot start without this one.
              </p>
            )}

            {ownerPrompt ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send({
                    kind: 'dont-know',
                    ownerName,
                    ownerRole,
                  }).then(() => {
                    setOwnerName('');
                    setOwnerRole('');
                  });
                }}
                className="mt-4 flex flex-wrap gap-2"
              >
                <input
                  value={ownerName}
                  onChange={(event) => setOwnerName(event.target.value)}
                  placeholder="Name"
                  required
                  className="flex-1 rounded-md border border-line px-3 py-2 text-sm"
                />
                <input
                  value={ownerRole}
                  onChange={(event) => setOwnerRole(event.target.value)}
                  placeholder="Their role"
                  className="flex-1 rounded-md border border-line px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={thinking || !ownerName.trim()}
                  className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
                >
                  Put it to them
                </button>
              </form>
            ) : (
              <>
                <textarea
                  ref={answerRef}
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      if (answer.trim()) void send({ kind: 'answer', content: answer });
                    }
                  }}
                  rows={4}
                  placeholder="Answer in your own words. Rough is fine."
                  className="mt-4 w-full rounded-md border border-line px-3 py-2 text-sm"
                />

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void send({ kind: 'answer', content: answer })}
                    disabled={thinking || !answer.trim()}
                    className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
                  >
                    {thinking ? '…' : 'Send'}
                  </button>

                  {/* First-class, not tolerated. It is the honest answer more
                      often than a guess is, and it produces a tracked gap. */}
                  <button
                    type="button"
                    onClick={() => void send({ kind: 'dont-know' })}
                    disabled={thinking}
                    className="rounded-md border border-line px-3 py-2 text-sm disabled:opacity-50"
                  >
                    I don&apos;t know
                  </button>

                  <span className="text-xs text-ink-soft">⌘↵ to send</span>
                </div>
              </>
            )}
          </div>

          {state && state.openConflicts > 0 && (
            <p className="mt-3 rounded-md border border-flag/40 bg-flag/5 px-3 py-2 text-xs text-flag">
              Two of your sources disagree on {state.openConflicts} point
              {state.openConflicts === 1 ? '' : 's'}. Both are kept — see the
              document.
            </p>
          )}

          {state && state.gaps.some((gap) => gap.ownerName) && (
            <div className="mt-5 rounded-lg border border-line bg-white p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                Waiting on someone
              </h2>
              <ul className="mt-2 space-y-1 text-xs">
                {state.gaps
                  .filter((gap) => gap.ownerName)
                  .map((gap) => (
                    <li key={gap.id}>
                      <span className="text-ink-soft">{gap.question}</span>{' '}
                      → <strong>{gap.ownerName}</strong>
                      {gap.ownerRole ? ` (${gap.ownerRole})` : ''}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {state && state.scores.length > 0 && (
            <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {state.scores.map((row) => (
                <div key={row.dimension} className="rounded-md border border-line bg-white p-2">
                  <div className="text-[10px] uppercase tracking-wide text-ink-soft">
                    {DIMENSION_LABEL[row.dimension] ?? row.dimension}
                  </div>
                  <div className="text-sm font-semibold tabular-nums">{row.pct}%</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {error && <p className="mt-4 text-sm text-flag">{error}</p>}

      {state && state.turns.length > 0 && !doc && (
        <details className="mt-8">
          <summary className="cursor-pointer text-xs text-ink-soft">
            What we have covered ({state.turns.length})
          </summary>
          <ol className="mt-3 space-y-2 text-sm">
            {state.turns.map((turn) => (
              <li key={turn.id} className={turn.role === 'USER' ? '' : 'text-ink-soft'}>
                <span className="text-[10px] uppercase tracking-wide text-ink-soft">
                  {turn.role === 'USER' ? 'you' : 'asked'}
                </span>{' '}
                {turn.content}
              </li>
            ))}
          </ol>
        </details>
      )}
    </main>
  );
}
