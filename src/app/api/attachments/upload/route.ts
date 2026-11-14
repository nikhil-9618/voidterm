import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { AttachmentQuotaError, storeAttachment } from '@/lib/attachments';
import { requireAuth } from '@/lib/auth';
import {
  csrfRejected,
  isSameOrigin,
  jsonError,
  rateLimited,
  unauthorized,
} from '@/lib/http';
import { attachmentUploadLimiter } from '@/lib/rate-limit';
import { inspectUpload, MAX_UPLOAD_BYTES } from '@/lib/upload-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 128 * 1024; // file + multipart overhead

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return csrfRejected();

  const user = await requireAuth();
  if (!user) return unauthorized();

  // Bound storage abuse before reading or parsing the body.
  const limit = await attachmentUploadLimiter.limit(user.id);
  if (!limit.success) return rateLimited(limit.reset);

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
    return jsonError(413, 'file_too_large', 'Files must be 4 MB or smaller.');
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(400, 'invalid_request', 'Expected multipart/form-data.');
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return jsonError(400, 'invalid_request', 'No file provided.');
  }

  if (file.size === 0) return jsonError(400, 'empty_file', 'The file is empty.');
  if (file.size > MAX_UPLOAD_BYTES) {
    return jsonError(413, 'file_too_large', 'Files must be 4 MB or smaller.');
  }

  const body = new Uint8Array(await file.arrayBuffer());
  const inspected = inspectUpload(file.name, body);
  if (!inspected) {
    return jsonError(
      415,
      'unsupported_type',
      'Unsupported file type. Upload a PNG, JPEG, GIF, WebP, a passive PDF, or a UTF-8 text/source file.',
    );
  }

  let attachment;
  try {
    attachment = await storeAttachment({
      userId: user.id,
      fileName: inspected.fileName,
      fileType: inspected.mime,
      bytes: body,
    });
  } catch (error) {
    if (error instanceof AttachmentQuotaError) {
      return jsonError(
        413,
        'storage_quota_exceeded',
        'Attachment storage limit reached. Delete an older conversation to free space.',
      );
    }
    console.error(
      '[upload] failed to store attachment:',
      error instanceof Error ? error.message : 'unknown',
    );
    return jsonError(500, 'upload_failed', 'Could not store the attachment.');
  }

  await audit('attachment.uploaded', user.id, {
    size: attachment.fileSize,
    type: attachment.fileType,
  });

  return NextResponse.json({ attachment }, { status: 201 });
}
