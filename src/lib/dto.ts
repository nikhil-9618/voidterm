import type { Attachment, Conversation, Message } from '@prisma/client';

export type MessageRole = 'user' | 'assistant' | 'system';

export type AttachmentDTO = {
  id: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
};

export type MessageDTO = {
  id: string;
  role: MessageRole;
  content: string;
  tokens: number | null;
  model: string | null;
  intentClass: string | null;
  createdAt: string;
  attachments: AttachmentDTO[];
};

export type ConversationSummaryDTO = {
  id: string;
  title: string;
  model: string;
  tier: number;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type ConversationDetailDTO = ConversationSummaryDTO & {
  systemPrompt: string | null;
  messages: MessageDTO[];
};

type ConversationWithCount = Conversation & { _count: { messages: number } };
type ConversationWithMessages = Conversation & {
  messages: Array<Message & { attachments: Attachment[] }>;
};

function normalizeRole(role: string): MessageRole {
  if (role === 'assistant' || role === 'system') return role;
  return 'user';
}

export function toMessageDTO(message: Message & { attachments: Attachment[] }): MessageDTO {
  return {
    id: message.id,
    role: normalizeRole(message.role),
    content: message.content,
    tokens: message.tokens,
    model: message.model,
    intentClass: message.intentClass,
    createdAt: message.createdAt.toISOString(),
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      fileUrl: attachment.fileUrl,
      fileType: attachment.fileType,
      fileSize: attachment.fileSize,
    })),
  };
}

export function toConversationSummary(conversation: ConversationWithCount): ConversationSummaryDTO {
  return {
    id: conversation.id,
    title: conversation.title,
    model: conversation.model,
    tier: conversation.tier,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messageCount: conversation._count.messages,
  };
}

export function toConversationDetail(conversation: ConversationWithMessages): ConversationDetailDTO {
  return {
    id: conversation.id,
    title: conversation.title,
    model: conversation.model,
    tier: conversation.tier,
    systemPrompt: conversation.systemPrompt,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messageCount: conversation.messages.length,
    messages: conversation.messages.map(toMessageDTO),
  };
}

/** First meaningful line of the opening message, capped for the sidebar. */
export function deriveConversationTitle(message: string): string {
  const firstLine = message
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) return 'New chat';

  const cleaned = firstLine.replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'New chat';
  return cleaned.length > 64 ? `${cleaned.slice(0, 64)}…` : cleaned;
}
