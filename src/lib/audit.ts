import { prisma } from './db';
import type { Prisma } from '@prisma/client';

/**
 * Append-only audit trail for authentication and privileged policy events.
 * Audit failures must never break the user-facing request, so they are logged
 * and swallowed.
 */
export async function audit(
  action: string,
  userId?: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        userId: userId ?? null,
        // Prisma's JSON input type is stricter than a plain object; the metadata
        // is constructed by our own code and is always JSON-serialisable.
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error) {
    console.error('[audit] failed to persist event', action, error instanceof Error ? error.message : 'unknown');
  }
}
