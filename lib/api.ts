import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AudioIngestDisabledError } from '@/lib/transcription/adapter';
import { ModelNotConfiguredError } from '@/lib/anthropic';
import { StorageNotConfiguredError } from '@/lib/storage';
import { UnsupportedFileTypeError } from '@/lib/ingest/extract-text';
import { CommandNotAvailableError } from '@/lib/skills';
import { ShareLinkExpiredError, WorkspaceNotFoundError, resolveShareToken } from '@/lib/workspace';

/**
 * Shared route plumbing.
 *
 * The error mapping matters more than it looks: an exec sees these strings. A
 * misconfigured deployment or a switched-off feature has to read as a clear
 * sentence, not a stack trace and not a generic 500.
 */

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(error: unknown): NextResponse {
  if (error instanceof WorkspaceNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ShareLinkExpiredError) {
    return NextResponse.json({ error: error.message }, { status: 410 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: 'That request was not shaped right.', details: error.issues },
      { status: 400 },
    );
  }
  if (
    error instanceof UnsupportedFileTypeError ||
    error instanceof AudioIngestDisabledError ||
    error instanceof CommandNotAvailableError
  ) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  if (error instanceof StorageNotConfiguredError || error instanceof ModelNotConfiguredError) {
    // The operator's problem, not the exec's — but it must be legible to both.
    console.error('[api] configuration error:', error);
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  console.error('[api] unhandled error:', error);
  return NextResponse.json({ error: 'Something went wrong on our side.' }, { status: 500 });
}

/** Resolve the share token in the route params to a workspace. */
export async function workspaceFromParams(
  params: Promise<{ token: string }>,
): Promise<{ id: string; name: string }> {
  const { token } = await params;
  return resolveShareToken(token);
}
