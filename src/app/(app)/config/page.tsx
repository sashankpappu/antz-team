import { ConfigClient } from "@/components/config-client";

export const metadata = { title: "Configuration · Vidur" };

export default function ConfigPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-8">
        <h1 className="display text-3xl text-ink md:text-4xl">Configuration</h1>
        <p className="mt-1 text-muted">
          Choose the model and providers, and manage keys. Saved here, applied at runtime —
          no .env editing.
        </p>
      </div>
      <ConfigClient />
    </div>
  );
}
