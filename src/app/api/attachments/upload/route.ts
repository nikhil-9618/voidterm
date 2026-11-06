import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { requireAuth } from '@/lib/auth';
import { env, isProduction } from '@/lib/env';
import { csrfRejected, isSameOrigin, jsonError, unauthorized } from '@/lib/http';
import { inspectUpload } from '@/lib/upload-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_MULTIPART_BYTES = MAX_FILE_BYTES + 128 * 1024; // file + multipart overhead

async function uploadToSupabase(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<{ ok: true; url: string } | { ok: false; status: number; message: string }> {
  const base = (env.SUPABASE_URL ?? '').replace(/\/$/, '');
  const bucket = env.SUPABASE_STORAGE_BUCKET;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  const objectPath = `${key}`;
  const uploadUrl = `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': contentType,
      'x-upsert': 'false',
    },
    body: new Uint8Array(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('[upload] supabase rejected upload', response.status, detail.slice(0, 200));
    return { ok: false, status: 502, message: 'Object storage rejected the upload.' };
  }

  return {
    ok: true,
    url: `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`,
  };
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return csrfRejected();

  const user = await requireAuth();
  if (!user) return unauthorized();

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
    return jsonError(413, 'file_too_large', 'Files must be 10 MB or smaller.');
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
  if (file.size > MAX_FILE_BYTES) {
    return jsonError(413, 'file_too_large', 'Files must be 10 MB or smaller.');
  }

  const body = Buffer.from(await file.arrayBuffer());
  const inspected = inspectUpload(file.name, body);
  if (!inspected) {
    return jsonError(
      415,
      'unsupported_type',
      'Unsupported file type. Upload a PNG, JPEG, GIF, WebP, PDF, or UTF-8 text/source file.',
    );
  }

  const filename = inspected.fileName;
  // User-scoped key: storage ownership mirrors database ownership.
  const key = `${user.id}/${randomUUID()}-${filename}`;

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const uploaded = await uploadToSupabase(key, body, inspected.mime);
    if (!uploaded.ok) {
      return jsonError(uploaded.status, 'upload_failed', uploaded.message);
    }
    await audit('attachment.uploaded', user.id, {
      size: file.size,
      type: inspected.mime,
    });
    return NextResponse.json({
      attachment: {
        fileUrl: uploaded.url,
        fileType: inspected.mime,
        fileSize: file.size,
        fileName: filename,
      },
    });
  }

  if (isProduction) {
    return jsonError(
      501,
      'storage_not_configured',
      'Attachment storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  // Development-only fallback. Serverless filesystems are read-only/ephemeral,
  // which is why this path is disabled in production.
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, filename), body);

  await audit('attachment.uploaded', user.id, {
    size: file.size,
    type: inspected.mime,
    storage: 'local-development',
  });

  return NextResponse.json({
    attachment: {
      fileUrl: `/uploads/${filename}`,
      fileType: inspected.mime,
      fileSize: file.size,
      fileName: filename,
    },
  });
}
