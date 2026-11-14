import { requireAuth } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { findOwnedAttachment } from '@/lib/attachments';
import { jsonError, unauthorized } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: { id: string } };

/**
 * Attachments are private. The only read path is this authenticated route,
 * which scopes the lookup by the signed-in user and forces a download with a
 * non-sniffable content type and a locked-down CSP.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const user = await requireAuth();
  if (!user) return unauthorized();

  const attachment = await findOwnedAttachment(user.id, params.id);
  if (!attachment) {
    return jsonError(404, 'not_found', 'Attachment not found.');
  }

  await audit('attachment.downloaded', user.id, {
    attachmentId: attachment.id,
    type: attachment.fileType,
    size: attachment.fileSize,
  });

  const filename = attachment.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'attachment';

  return new Response(new Uint8Array(attachment.data), {
    status: 200,
    headers: {
      'Content-Type': attachment.fileType,
      'Content-Length': String(attachment.fileSize),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
