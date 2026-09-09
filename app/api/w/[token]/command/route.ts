import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fail, ok, workspaceFromParams } from '@/lib/api';
import { runCommand } from '@/lib/skills';

const CommandSchema = z.object({ command: z.string().min(1).max(40) });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const workspace = await workspaceFromParams(params);
    const { command } = CommandSchema.parse(await request.json());
    return ok(await runCommand(workspace.id, command));
  } catch (error) {
    return fail(error);
  }
}
