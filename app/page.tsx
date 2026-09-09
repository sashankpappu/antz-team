import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Intake</h1>
      <p className="mt-4 text-ink-soft leading-relaxed">
        Someone at Antz seeds a workspace with whatever already exists — a deck, a
        call transcript, a chat thread — and sends a link. The business user opens
        it and has a conversation. At the end there is a BRD a developer who has
        never met them can build from.
      </p>
      <p className="mt-8">
        <Link
          href="/admin"
          className="inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper"
        >
          Seed a workspace
        </Link>
      </p>
      <p className="mt-10 text-xs text-ink-soft">
        Business users do not come through this page. They arrive on a link.
      </p>
    </main>
  );
}
