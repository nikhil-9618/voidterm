import { createHash } from 'node:crypto';
import { prisma } from './db';
import { decodeTextAttachment, isTextAttachment, MAX_USER_ATTACHMENT_BYTES } from './upload-security';

export const ATTACHMENT_URL_PREFIX = '/api/attachments/';

export type StoredAttachment = {
  id: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  fileName: string;
};

export type AttachmentInput = {
  fileUrl: string;
  fileType: string;
  fileSize: number;
  fileName?: string;
};

/** Only our own opaque attachment URLs are read; arbitrary external URLs are never fetched. */
export function attachmentIdFromUrl(fileUrl: string): string | null {
  if (!fileUrl.startsWith(ATTACHMENT_URL_PREFIX)) return null;
  const id = fileUrl.slice(ATTACHMENT_URL_PREFIX.length);
  return /^[a-z0-9]{20,40}$/i.test(id) ? id : null;
}

export async function storeAttachment(input: {
  userId: string;
  fileName: string;
  fileType: string;
  bytes: Uint8Array;
}): Promise<StoredAttachment> {
  const existing = await prisma.attachmentBlob.aggregate({
    where: { userId: input.userId },
    _sum: { fileSize: true },
  });

  const used = existing._sum.fileSize ?? 0;
  if (used + input.bytes.byteLength > MAX_USER_ATTACHMENT_BYTES) {
    throw new AttachmentQuotaError();
  }

  const blob = await prisma.attachmentBlob.create({
    data: {
      userId: input.userId,
      fileName: input.fileName,
      fileType: input.fileType,
      fileSize: input.bytes.byteLength,
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
      data: Buffer.from(input.bytes),
    },
    select: { id: true, fileType: true, fileSize: true, fileName: true },
  });

  return {
    id: blob.id,
    fileUrl: `${ATTACHMENT_URL_PREFIX}${blob.id}`,
    fileType: blob.fileType,
    fileSize: blob.fileSize,
    fileName: blob.fileName,
  };
}

export class AttachmentQuotaError extends Error {
  constructor() {
    super('Attachment storage quota exceeded.');
  }
}

export async function findOwnedAttachment(userId: string, id: string) {
  return prisma.attachmentBlob.findFirst({
    where: { id, userId },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      fileSize: true,
      data: true,
    },
  });
}

const MAX_CONTEXT_CHARS = 24_000;
const MAX_FILE_CHARS = 12_000;

/**
 * Build a delimited, size-bounded block of user-supplied file contents for the
 * model. Binary files are represented by metadata only; they are never decoded
 * into the prompt. The surrounding system prompt marks this block as untrusted
 * data so file contents cannot be mistaken for operator instructions.
 */
export async function buildAttachmentContext(
  userId: string,
  attachments: AttachmentInput[] | undefined,
): Promise<string> {
  if (!attachments || attachments.length === 0) return '';

  const ids = attachments
    .map((attachment) => attachmentIdFromUrl(attachment.fileUrl))
    .filter((id): id is string => Boolean(id));

  const blobs = ids.length
    ? await prisma.attachmentBlob.findMany({
        where: { id: { in: ids }, userId },
        select: { id: true, fileName: true, fileType: true, fileSize: true, data: true },
      })
    : [];

  const byId = new Map(blobs.map((blob) => [blob.id, blob]));
  const sections: string[] = [];
  let remaining = MAX_CONTEXT_CHARS;

  for (const attachment of attachments) {
    const id = attachmentIdFromUrl(attachment.fileUrl);
    const blob = id ? byId.get(id) : undefined;

    if (!blob || !isTextAttachment(blob.fileType)) {
      const name = blob?.fileName ?? attachment.fileName ?? 'attachment';
      const type = blob?.fileType ?? attachment.fileType;
      sections.push(
        `<attachment name="${escapeAttribute(name)}" type="${escapeAttribute(type)}">[binary or non-text attachment — contents are stored privately and were not sent to the model]</attachment>`,
      );
      continue;
    }

    if (remaining <= 0) {
      sections.push(
        `<attachment name="${escapeAttribute(blob.fileName)}" type="${escapeAttribute(blob.fileType)}">[omitted — attachment context limit reached]</attachment>`,
      );
      continue;
    }

    const text = decodeTextAttachment(blob.data)
      .replace(/<\/attachment>/gi, '<\\/attachment>')
      .slice(0, MAX_FILE_CHARS);

    const included = text.slice(0, Math.min(MAX_FILE_CHARS, remaining));
    remaining -= included.length;

    sections.push(
      `<attachment name="${escapeAttribute(blob.fileName)}" type="${escapeAttribute(blob.fileType)}">\n${included}\n</attachment>`,
    );
  }

  return sections.join('\n\n');
}

function escapeAttribute(value: string): string {
  return value.replace(/[<>"'&]/g, '').slice(0, 120);
}
