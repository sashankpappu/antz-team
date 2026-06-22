import type { Citation } from "@/lib/gbrain/types";
import { cn } from "@/lib/cn";

export interface AnswerView {
  answer: string;
  citations: Citation[];
  gaps: string[];
  pagesGathered?: number;
  synthesisOk?: boolean;
  degraded?: boolean;
}

/**
 * Renders a brain-derived answer the way the brief demands: the synthesis,
 * its inline citations, and an honest "what the brain doesn't know yet" note.
 * Used by both Capture recall and the Brain Ask box.
 */
export function BrainAnswer({ view, emptyLabel }: { view: AnswerView; emptyLabel: string }) {
  const hasAnswer = view.synthesisOk !== false && view.answer.trim().length > 0;

  return (
    <div className="space-y-4">
      {view.degraded && (
        <p className="rounded-md bg-accent-tint px-3 py-2 text-xs text-accent-deep">
          Live brain unreachable — answered from local memory. Capture still works.
        </p>
      )}

      {hasAnswer ? (
        <p className="text-[15px] leading-relaxed text-ink">{view.answer}</p>
      ) : (
        <p className="text-[15px] leading-relaxed text-muted">{emptyLabel}</p>
      )}

      {view.citations.length > 0 && (
        <div>
          <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-muted">Sources</p>
          <ul className="space-y-1">
            {view.citations.map((c) => (
              <li key={`${c.pageSlug}-${c.citationIndex}`} className="flex items-baseline gap-2 text-sm">
                {c.citationIndex != null && (
                  <span className="font-mono text-xs text-accent">[{c.citationIndex}]</span>
                )}
                <span className="font-mono text-[13px] text-ink">{c.pageSlug}</span>
                {c.rowNum != null && <span className="text-xs text-muted">· row {c.rowNum}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.gaps.length > 0 && (
        <div className="rounded-md border border-line bg-paper px-4 py-3">
          <p className="text-sm font-medium text-ink">What the brain doesn&apos;t know yet</p>
          <ul className="mt-2 space-y-1.5">
            {view.gaps.map((g) => (
              <li key={g} className={cn("flex gap-2 text-sm text-muted")}>
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-needs/70" aria-hidden />
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
