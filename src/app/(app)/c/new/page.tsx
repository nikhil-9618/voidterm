import type { Metadata } from 'next';
import { ChatView } from '@/components/chat/chat-view';

export const metadata: Metadata = {
  title: 'New session',
};

export default function NewChatPage() {
  return <ChatView initialConversation={null} initialMessages={[]} />;
}
