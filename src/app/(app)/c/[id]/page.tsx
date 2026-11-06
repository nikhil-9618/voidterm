import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ChatView } from '@/components/chat/chat-view';
import { getSessionFromCookies } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { toConversationDetail } from '@/lib/dto';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Conversation',
};

export default async function ConversationPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getSessionFromCookies();
  if (!user) notFound();

  // Ownership is part of the query itself — never fetch by id alone.
  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, userId: user.id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { attachments: true },
      },
    },
  });

  if (!conversation) notFound();

  const detail = toConversationDetail(conversation);

  return (
    <ChatView
      key={detail.id}
      initialConversation={{
        id: detail.id,
        title: detail.title,
        model: detail.model,
        systemPrompt: detail.systemPrompt,
      }}
      initialMessages={detail.messages}
    />
  );
}
