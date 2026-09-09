import { NextRequest } from 'next/server';
import { fail, workspaceFromParams } from '@/lib/api';
import { renderArchitecture } from '@/lib/render/architecture';
import { renderBrd, renderExecView } from '@/lib/render/brd';

/**
 * Both renders from one store, plus the architecture. Markdown export; the
 * browser handles PDF from the rendered view.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const workspace = await workspaceFromParams(params);
    const view = request.nextUrl.searchParams.get('view') ?? 'brd';
    const download = request.nextUrl.searchParams.get('download') === '1';

    let markdown: string;
    let filename: string;

    switch (view) {
      case 'exec':
        markdown = await renderExecView(workspace.id);
        filename = 'summary.md';
        break;
      case 'architecture':
        markdown = await renderArchitecture(workspace.id);
        filename = 'architecture.md';
        break;
      case 'brd':
      default:
        markdown = (await renderBrd(workspace.id)).markdown;
        filename = 'brd.md';
        break;
    }

    return new Response(markdown, {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        ...(download
          ? { 'content-disposition': `attachment; filename="${filename}"` }
          : {}),
      },
    });
  } catch (error) {
    return fail(error);
  }
}
