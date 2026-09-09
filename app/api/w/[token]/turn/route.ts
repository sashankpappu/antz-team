import { after } from 'next/server';
import { NextRequest } from 'next/server';
import { TurnMedium } from '@prisma/client';
import { z } from 'zod';
import { fail, ok, workspaceFromParams } from '@/lib/api';
import { handleTurn } from '@/lib/interview/turn';

/**
 * One turn.
 *
 * The response is built from the gap cache and returned immediately. Claim
 * extraction, rescoring and question generation run in `after()` — after the
 * response has been flushed to the client, off the critical path.
 *
 * This is the constraint that makes the voice target reachable: whatever the
 * completeness engine costs, the exec never waits for it.
 */

const TurnSchema = z.object({
  kind: z.enum(['answer', 'dont-know', 'start']).default('answer'),
  content: z.string().max(20_000).optional(),
  medium: z.nativeEnum(TurnMedium).default(TurnMedium.TEXT),
  command: z.string().max(40).optional(),
  ownerName: z.string().max(200).optional(),
  ownerRole: z.string().max(200).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const workspace = await workspaceFromParams(params);
    const body = TurnSchema.parse(await request.json());

    const { response, deferred } = await handleTurn({
      workspaceId: workspace.id,
      ...body,
    });

    after(async () => {
      try {
        await deferred();
      } catch (error) {
        // A failed rescore leaves a stale cache, which is a slightly worse
        // next question. It is never a failed turn.
        console.error(`[turn] deferred work failed for ${workspace.id}:`, error);
      }
    });

    return ok(response);
  } catch (error) {
    return fail(error);
  }
}
