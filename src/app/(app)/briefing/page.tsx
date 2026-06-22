import { Surface, Planned } from "@/components/surface";

export default function BriefingPage() {
  return (
    <Surface title="Dream & Briefing" blurb="What shipped, what's holding, what needs you." phase="Phase 4">
      <Planned
        points={[
          "Auto-generated morning briefing: shipped / holding / running / what I'd watch.",
          "Dream-cycle status from the nightly enrichment job.",
          "Contradiction and staleness flags when notes disagree or age out.",
          "One screen, readable at 7am with no terminal in sight.",
        ]}
      />
    </Surface>
  );
}
