import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export type AxeConversation = {
  id: string;
  title: string;
  pinned_context?: string | null;
  last_message_at?: string | null;
};

export type AxeMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool' | string;
  content: string;
  created_at: string;
};

export async function getAuthedUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user?.id ?? null;
}

export async function ensurePrimaryConversation(userId: string): Promise<AxeConversation | null> {
  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('id,title,pinned_context,last_message_at')
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false })
    .limit(1);

  if (!error && conversations && conversations.length > 0) {
    return conversations[0] as AxeConversation;
  }

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert({
      user_id: userId,
      title: 'AXE',
      pinned_context: null,
      last_message_at: new Date().toISOString(),
    })
    .select('id,title,pinned_context,last_message_at')
    .single();

  if (createError) return null;
  return created as AxeConversation;
}

export async function loadThread(userId: string): Promise<{ conversation: AxeConversation; messages: AxeMessage[] } | null> {
  const conversation = await ensurePrimaryConversation(userId);
  if (!conversation) return null;

  const { data, error } = await supabase
    .from('messages')
    .select('id,role,content,created_at')
    .eq('conversation_id', conversation.id)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) return { conversation, messages: [] };
  return { conversation, messages: (data as AxeMessage[]) ?? [] };
}

export async function sendUserMessage(userId: string, conversationId: string, content: string): Promise<void> {
  const trimmed = content.trim();
  if (!trimmed) return;

  await supabase.from('messages').insert({
    conversation_id: conversationId,
    user_id: userId,
    role: 'user',
    content: trimmed,
  });

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', userId);
}

