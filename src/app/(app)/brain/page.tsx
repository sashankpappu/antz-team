import { Surface, Planned } from "@/components/surface";

export default function BrainPage() {
  return (
    <Surface title="Brain" blurb="Ask what we already know." phase="Phase 1 · 5">
      <Planned
        points={[
          "Ask box backed by gbrain think — synthesized answers with inline citations.",
          'An honest "what the brain doesn\'t know yet" gap note on every answer.',
          "Toggle to raw hybrid search results.",
          "Knowledge graph: people, companies, deals, projects with typed edges.",
        ]}
      />
    </Surface>
  );
}
