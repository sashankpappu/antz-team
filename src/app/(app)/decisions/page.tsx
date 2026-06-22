import { Surface, Planned } from "@/components/surface";

export default function DecisionsPage() {
  return (
    <Surface title="Decisions" blurb="The human-only forks, with the crew's recommendation." phase="Phase 3">
      <Planned
        points={[
          "Decision cards for taste / scope / risk / security forks.",
          "Each card carries the crew's recommendation in plain English.",
          "One-tap Approve / Adjust / Reject — resolving resumes the sprint.",
          "This is the only surface where the gold accent appears.",
        ]}
      />
    </Surface>
  );
}
