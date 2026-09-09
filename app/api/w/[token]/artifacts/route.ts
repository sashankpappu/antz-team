import { NextRequest } from 'next/server';
import { ArtifactKind } from '@prisma/client';
import { z } from 'zod';
import { fail, ok, workspaceFromParams } from '@/lib/api';
import { ingestFile, ingestPaste } from '@/lib/ingest';

/**
 * Ingest. Upload a file or paste text; both land as artifacts and go through
 * the same extraction into claims.
 *
 * Seeding normally happens before the link is sent, but the exec can add
 * something mid-session — "here, this is the deck" — and it must be the same
 * path, not a second one.
 */

const PasteSchema = z.object({
  label: z.string().min(1).max(200),
  raw: z.string().min(1),
  kind: z.nativeEnum(ArtifactKind),
  uploadedBy: z.string().min(1).max(200).default('business user'),
  /**
   * Uploader attestation that they had the right to share this. Logged with
   * the artifact; required for a transcript, which by definition contains
   * other people's words (docs/DECISIONS.md D3).
   */
  attestConsent: z.boolean().optional(),
});

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const workspace = await workspaceFromParams(params);
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');

      if (!(file instanceof File)) {
        return ok({ error: 'No file was attached.' }, 400);
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return ok({ error: 'That file is over the 25MB limit.' }, 413);
      }

      const kindField = form.get('kind');
      const kind =
        typeof kindField === 'string' && kindField in ArtifactKind
          ? (kindField as ArtifactKind)
          : undefined;

      const needsAttestation = kind === ArtifactKind.TRANSCRIPT || kind === ArtifactKind.CHAT;
      if (needsAttestation && form.get('attestConsent') !== 'true') {
        return ok(
          {
            error:
              'Confirm you have the right to share this transcript before uploading it. ' +
              'It contains other people\'s words.',
          },
          422,
        );
      }

      const uploadedBy = String(form.get('uploadedBy') ?? 'business user');
      const result = await ingestFile({
        workspaceId: workspace.id,
        filename: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        uploadedBy,
        kind,
        contentType: file.type || undefined,
      });

      return ok(result, 201);
    }

    const body = PasteSchema.parse(await request.json());

    const needsAttestation =
      body.kind === ArtifactKind.TRANSCRIPT || body.kind === ArtifactKind.CHAT;
    if (needsAttestation && !body.attestConsent) {
      return ok(
        {
          error:
            'Confirm you have the right to share this before pasting it in. ' +
            "It contains other people's words.",
        },
        422,
      );
    }

    const result = await ingestPaste({ workspaceId: workspace.id, ...body });
    return ok(result, 201);
  } catch (error) {
    return fail(error);
  }
}
