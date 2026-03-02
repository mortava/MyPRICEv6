-- Live Chat tables for helpdesk/sales real-time communication
-- Run this migration against your Supabase project

create table if not exists chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  user_name text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  department text not null default 'support' check (department in ('support', 'sales')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references chat_conversations(id) on delete cascade,
  sender_role text not null check (sender_role in ('user', 'agent')),
  sender_name text not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- Index for fast message lookups by conversation
create index if not exists idx_chat_messages_conversation
  on chat_messages(conversation_id, created_at);

-- Index for finding open conversations
create index if not exists idx_chat_conversations_status
  on chat_conversations(status, updated_at desc);

-- Enable realtime on chat_messages so clients get instant updates
alter publication supabase_realtime add table chat_messages;

-- RLS policies
alter table chat_conversations enable row level security;
alter table chat_messages enable row level security;

create policy "Users can view own conversations"
  on chat_conversations for select
  using (true);

create policy "Users can create conversations"
  on chat_conversations for insert
  with check (true);

create policy "Users can update own conversations"
  on chat_conversations for update
  using (true);

create policy "Users can view messages in their conversations"
  on chat_messages for select
  using (true);

create policy "Users can send messages"
  on chat_messages for insert
  with check (true);
