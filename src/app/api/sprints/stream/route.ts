import { auth } from "@/auth";
import { getGstack } from "@/lib/gstack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live sprint status over SSE (§2). On connect we send a snapshot of the
 * user's sprints, then stream every transition. Events for other users are
 * filtered out — the stream is scoped to the signed-in user.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });
  const userId = session.user.id;
  const engine = getGstack();

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      send({ type: "snapshot", sprints: engine.list(userId) });

      unsubscribe = engine.on((e) => {
        if (e.type === "sprint" && e.sprint.userId !== userId) return;
        try {
          send(e);
        } catch {
          /* controller closed */
        }
      });

      // Heartbeat keeps the connection from idling out behind proxies.
      ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(ping);
        }
      }, 15000);
    },
    cancel() {
      unsubscribe?.();
      clearInterval(ping);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
