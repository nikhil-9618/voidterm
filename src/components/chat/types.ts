import type { MessageDTO } from '@/lib/dto';

export type LocalAttachment = {
  fileUrl: string;
  fileType: string;
  fileSize: number;
  fileName?: string;
};

export type ChatMessageView = MessageDTO & {
  /** Optimistically rendered, not yet confirmed by the server. */
  pending?: boolean;
  /** Provider or transport error attached to this turn. */
  error?: string | null;
  /** Rendered locally only (e.g. a policy notice); not persisted. */
  transient?: boolean;
  /** Time from request start to first streamed token, measured locally. */
  latencyMs?: number;
};
