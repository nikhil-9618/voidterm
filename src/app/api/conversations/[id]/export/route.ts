import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { jsonError, unauthorized } from '@/lib/http';
import { toConversationDetail } from '@/lib/dto';
import { modelLabel } from '@/lib/ai/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: { id: string } };

function safeFilename(title: string, id: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `voidterm-${slug || id}`;
}

function renderMarkdown(conversation: ReturnType<typeof toConversationDetail>): string {
  const lines: string[] = [];
  lines.push(`# ${conversation.title}`);
  lines.push('');
  lines.push(`- Model: ${modelLabel(conversation.model)} (\`${conversation.model}\`)`);
  lines.push(`- Created: ${conversation.createdAt}`);
  lines.push(`- Updated: ${conversation.updatedAt}`);
  lines.push(`- Messages: ${conversation.messageCount}`);
  lines.push('');
  if (conversation.systemPrompt) {
    lines.push('## System prompt');
    lines.push('');
    lines.push(conversation.systemPrompt);
    lines.push('');
  }
  lines.push('---');

  for (const message of conversation.messages) {
    lines.push('');
    lines.push(`## ${message.role}`);
    lines.push('');
    lines.push(message.content);
    if (message.attachments.length > 0) {
      lines.push('');
      for (const attachment of message.attachments) {
        lines.push(`[attachment: ${attachment.fileType}](${attachment.fileUrl})`);
      }
    }
    lines.push('');
    lines.push('---');
  }

  lines.push('');
  lines.push('_Exported from VOIDTERM._');
  return lines.join('\n');
}

export async function GET(request: Request, { params }: RouteContext) {
  const user = await requireAuth();
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const format = url.searchParams.get('format') === 'markdown' ? 'markdown' : 'json';

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, userId: user.id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { attachments: true },
      },
    },
  });

  if (!conversation) {
    return jsonError(404, 'not_found', 'Conversation not found.');
  }

  const dto = toConversationDetail(conversation);
  const base = safeFilename(dto.title, dto.id);

  if (format === 'markdown') {
    return new Response(renderMarkdown(dto), {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.md"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  return new Response(JSON.stringify(dto, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${base}.json"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
