import { Surface, Planned } from "@/components/surface";

export default function ExecutePage() {
  return (
    <Surface title="Execute" blurb="Sprints in motion across the crew." phase="Phase 2">
      <Planned
        points={[
          "Parallel-sprint board across all 7 stages: Think → Plan → Design → Build → Review → Test → Ship.",
          "Live stage transitions streamed from gstack via the Agent SDK.",
          "Click a sprint for its artifacts and log.",
          "Think stage runs a brain-first lookup so the crew never re-solves a solved problem.",
        ]}
      />
    </Surface>
  );
}
