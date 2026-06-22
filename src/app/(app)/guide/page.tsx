import { Card, CardBody } from "@/components/ui/card";
import {
  Inbox,
  Brain,
  GitBranch,
  GitFork,
  Sunrise,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export const metadata = { title: "Guide · Vidur" };

/** A numbered quick-start step. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-tint font-mono text-sm font-semibold text-accent-deep">
        {n}
      </span>
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{children}</p>
      </div>
    </li>
  );
}

/** One surface, explained. */
function Surface({
  icon: Icon,
  name,
  what,
  how,
}: {
  icon: LucideIcon;
  name: string;
  what: string;
  how: string;
}) {
  return (
    <Card>
      <CardBody className="flex gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-tint text-accent-deep">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="font-medium text-ink">{name}</p>
          <p className="mt-1 text-sm text-ink">{what}</p>
          <p className="mt-2 text-sm text-muted">
            <span className="font-mono text-[11px] uppercase tracking-wide text-accent">how</span>{" "}
            {how}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

export default function GuidePage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="mb-10">
        <h1 className="display text-3xl text-ink md:text-4xl">How to use Vidur</h1>
        <p className="mt-2 text-muted">
          Vidur is one place to hand in everything on your plate. It remembers what you
          know, and it gets things done — you stay in the driver&apos;s seat.
        </p>
      </header>

      {/* In one line */}
      <Card className="mb-10 bg-accent-tint/40">
        <CardBody>
          <p className="text-[15px] leading-relaxed text-ink">
            Hand Vidur an idea, an email, a bug, or a decision. It instantly shows you{" "}
            <span className="font-medium">what you already know</span> about it, and tells
            you honestly <span className="font-medium">what it doesn&apos;t</span>. Then it
            either keeps it in mind for later, or spins up a crew to ship it — pausing only
            when something genuinely needs <span className="text-needs">your</span> decision.
          </p>
        </CardBody>
      </Card>

      {/* Quick start */}
      <section className="mb-12">
        <h2 className="display mb-5 text-2xl text-ink">Start in 60 seconds</h2>
        <Card>
          <CardBody>
            <ol className="space-y-5">
              <Step n={1} title="Sign in">
                One click. You land on a calm home screen — no setup, no config files.
              </Step>
              <Step n={2} title="Hand something to Vidur">
                On <strong>Capture</strong>, paste an email or type a thought and press{" "}
                <em>Hand it to Vidur</em> (or ⌘/Ctrl + Enter). Within a moment you&apos;ll see
                what the brain already knows, with sources, plus open questions.
              </Step>
              <Step n={3} title="Ask a question">
                Open <strong>Brain</strong> and ask in plain English — e.g. &ldquo;What do we
                know about Alice at Acme?&rdquo;. You get a written answer with citations and
                an honest &ldquo;what I don&apos;t know yet&rdquo; note.
              </Step>
              <Step n={4} title="Start something">
                Tap <em>Start it</em> on an inbox item (or on <strong>Execute</strong>) and
                watch a sprint move across the stages on its own.
              </Step>
              <Step n={5} title="Make the calls only you can make">
                When a sprint needs you, <strong>Decisions</strong> lights up gold. Read the
                crew&apos;s recommendation and tap Approve, Adjust, or Reject.
              </Step>
            </ol>
          </CardBody>
        </Card>
      </section>

      {/* The loop */}
      <section className="mb-12">
        <h2 className="display mb-3 text-2xl text-ink">The idea in one breath</h2>
        <p className="mb-4 text-sm text-muted">
          Everything you hand in flows the same way:
        </p>
        <Card>
          <CardBody>
            <p className="text-center font-mono text-[13px] leading-7 text-ink">
              you hand it in → the brain reads it first →
              <br />
              <span className="text-muted">know</span> (it rests in memory, resurfaces later)
              {"  ·  "}
              <span className="text-accent">do</span> (a crew ships it, then teaches the brain)
            </p>
            <p className="mt-4 text-sm text-muted">
              The more you use it, the smarter tomorrow&apos;s briefing gets — finished work
              flows back into the brain as something you can ask about.
            </p>
          </CardBody>
        </Card>
      </section>

      {/* The tabs */}
      <section className="mb-12">
        <h2 className="display mb-5 text-2xl text-ink">The tabs, one job each</h2>
        <div className="space-y-3">
          <Surface
            icon={Inbox}
            name="Capture — home"
            what="The single place to hand Vidur anything: type, paste, voice, email, or a webhook."
            how="Drop something in and submit. You'll see a route suggestion (know vs. do), instant recall with sources, and open questions. Everything lands in the inbox below."
          />
          <Surface
            icon={Brain}
            name="Brain"
            what="Ask what the company already knows — answers are synthesized, cited, and honest about gaps."
            how="Type a question and Ask. Toggle Raw search to see the underlying pages. Scroll down for the knowledge graph: click a person, company, or deal to see how it connects."
          />
          <Surface
            icon={GitBranch}
            name="Execute"
            what="The live board of work in motion, across seven stages from Think to Ship."
            how="Start a sprint from the box at the top (or via Start it in Capture). Watch it advance live; click any sprint to see its artifacts and log."
          />
          <Surface
            icon={GitFork}
            name="Decisions"
            what="The short list of forks that need a human. This is the only place gold ever appears."
            how="Each card explains the choice in plain English with the crew's recommendation. Tap Approve, Adjust, or Reject — the sprint resumes the moment you decide."
          />
          <Surface
            icon={Sunrise}
            name="Dream & Briefing"
            what="A one-screen morning read: what shipped, what's running, what's holding, and what to watch."
            how="Open it first thing. 'What I'd watch' flags notes that disagree or are going stale. Tap Run dream cycle now to refresh on demand."
          />
          <Surface
            icon={ShieldCheck}
            name="Govern"
            what="Your access, the brain's scoping, configuration, scheduled jobs, and the full audit trail."
            how="Check which model and providers are configured, confirm what you can see vs. write, and review the cited, append-only log of every brain answer and action."
          />
        </div>
      </section>

      {/* Good to know */}
      <section className="mb-12">
        <h2 className="display mb-5 text-2xl text-ink">Good to know</h2>
        <Card>
          <CardBody>
            <ul className="space-y-3 text-sm">
              {[
                ["Every answer is cited.", "When Vidur tells you something from the brain, it shows the source pages — and logs them, so you can always trace where an answer came from."],
                ["It admits what it doesn't know.", "Every synthesized answer carries an honest gap note. No confident guessing."],
                ["Gold means you.", "The gold colour is reserved for one thing: a decision waiting on you. If nothing is gold, nothing needs you."],
                ["It keeps working if a part is down.", "If the execution crew or live brain is unreachable, capture and recall still work — nothing is lost."],
                ["Your notes are yours.", "Reads are scoped to you. A teammate can't see your private notes, and that boundary is tested, not assumed."],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  <span className="text-muted">
                    <span className="font-medium text-ink">{t}</span> {d}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </section>

      <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
        That&apos;s it. Hand Vidur your first thing on the Capture tab.
      </p>
    </div>
  );
}
