import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getConversationForUser, getMessages } from "@/server/services/chat";
import { ChatRoom } from "@/components/chat/chat-room";

export const metadata: Metadata = { title: "Conversation", robots: { index: false } };

type Props = { params: Promise<{ id: string }> };

export default async function ConversationPage({ params }: Props) {
  const session = await requireUser();
  const { id } = await params;

  // Membership gate — non-members 404 (no enumeration of others' chats).
  const header = await getConversationForUser(session.user.id, id);
  if (!header) notFound();

  const page = await getMessages(session.user.id, id);

  return (
    <ChatRoom
      // key per conversation → switching threads remounts (fresh state + socket).
      key={header.id}
      conversationId={header.id}
      currentUserId={session.user.id}
      other={{ name: header.otherName, image: header.otherImage }}
      orderId={header.orderId}
      initialMessages={page?.messages ?? []}
      initialCursor={page?.nextCursor ?? null}
    />
  );
}
