create table if not exists public.guest_chat_usage (
  fingerprint text not null,
  date date not null,
  message_count integer not null default 0,
  updated_at timestamp with time zone not null default now(),
  primary key (fingerprint, date)
);

create table if not exists public.user_chat_usage (
  user_id text not null,
  date date not null,
  message_count integer not null default 0,
  updated_at timestamp with time zone not null default now(),
  primary key (user_id, date)
);

create index if not exists guest_chat_usage_fingerprint_idx
  on public.guest_chat_usage (fingerprint);

create index if not exists guest_chat_usage_date_idx
  on public.guest_chat_usage (date);

create index if not exists user_chat_usage_user_id_idx
  on public.user_chat_usage (user_id);

create index if not exists user_chat_usage_date_idx
  on public.user_chat_usage (date);

alter table public.guest_chat_usage enable row level security;
alter table public.user_chat_usage enable row level security;

create policy "Allow public read/write for guest tracking"
on public.guest_chat_usage
for all
using (true)
with check (true);

create policy "Allow public read/write for user tracking"
on public.user_chat_usage
for all
using (true)
with check (true);
