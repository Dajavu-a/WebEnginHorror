create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_type text not null check (
    event_type in (
      'login_success',
      'signup_success',
      'logout',
      'answer_selected',
      'recommendation_generated'
    )
  ),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_created_at_idx
  on public.activity_logs (created_at desc);
create index if not exists activity_logs_user_id_created_at_idx
  on public.activity_logs (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.activity_logs enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    coalesce(new.email, ''),
    case
      when new.email_confirmed_at is not null
        and lower(coalesce(new.email, '')) = 'thanaphatsandee@gmail.com'
      then 'admin'
      else 'user'
    end
  )
  on conflict (id) do update
    set email = excluded.email,
        role = excluded.role;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.profiles (id, email, role)
select
  id,
  coalesce(email, ''),
  case
    when email_confirmed_at is not null
      and lower(coalesce(email, '')) = 'thanaphatsandee@gmail.com'
    then 'admin'
    else 'user'
  end
from auth.users
on conflict (id) do update
  set email = excluded.email,
      role = excluded.role;

drop policy if exists "Users and admins can read profiles" on public.profiles;
create policy "Users and admins can read profiles"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Users can create their own activity" on public.activity_logs;
create policy "Users can create their own activity"
  on public.activity_logs for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users and admins can read activity" on public.activity_logs;
create policy "Users and admins can read activity"
  on public.activity_logs for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

grant select on public.profiles to authenticated;
grant select, insert on public.activity_logs to authenticated;
grant usage, select on sequence public.activity_logs_id_seq to authenticated;
