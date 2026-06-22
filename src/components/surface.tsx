import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/cn";

interface SurfaceProps {
  title: string;
  blurb: string;
  /** Which build phase lights this surface up — shown as a quiet badge. */
  phase: string;
  children?: React.ReactNode;
}

/** Shared frame for a surface: a serif title, a one-line job, then content. */
export function Surface({ title, blurb, phase, children }: SurfaceProps) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="display text-3xl text-ink md:text-4xl">{title}</h1>
          <p className="mt-1 text-muted">{blurb}</p>
        </div>
        <span className="mt-2 shrink-0 rounded-full border border-line px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-muted">
          {phase}
        </span>
      </div>
      {children}
    </div>
  );
}

interface PlannedProps {
  /** What this surface will do — the contract for the upcoming phase. */
  points: string[];
  className?: string;
}

/** A calm placeholder describing the surface's job until its phase lands. */
export function Planned({ points, className }: PlannedProps) {
  return (
    <Card className={cn(className)}>
      <CardBody>
        <p className="text-sm font-medium text-ink">Coming in this surface</p>
        <ul className="mt-3 space-y-2">
          {points.map((p) => (
            <li key={p} className="flex gap-2.5 text-sm text-muted">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
