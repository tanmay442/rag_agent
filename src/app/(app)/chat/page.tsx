import { ChatInterface } from '@/components/ChatInterface';
import { requireSession } from '@/composition';

export default async function ChatPage() {
  await requireSession();
  return (
    <div className="flex h-dvh min-h-0 flex-col">
      <ChatInterface />
    </div>
  );
}
