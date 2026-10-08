-- Foundry School Lost & Found: run this entire file once in Supabase SQL Editor.
-- It creates private member data, reports, claims, ownership checks, and image access rules.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null default 'School member',
  role text not null default 'member' check (role in ('member', 'invigilator', 'head')),
  created_at timestamptz not null default now()
);

-- Leave the list empty for a small demo. For school use, add the allowed email domains below.
create table if not exists public.school_settings (
  singleton boolean primary key default true check (singleton),
  allowed_email_domains text[] not null default '{}'::text[]
);

insert into public.school_settings (singleton, allowed_email_domains)
values (true, '{}'::text[])
on conflict (singleton) do nothing;

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('LF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  reported_by uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('found', 'lost')),
  title text not null check (length(btrim(title)) between 3 and 80),
  category text not null check (category in ('Bags', 'Books', 'Clothing', 'Electronics', 'Other')),
  location text not null check (length(btrim(location)) between 2 and 100),
  description text not null default '' check (length(description) <= 500),
  photo_path text,
  status text not null default 'open' check (status in ('open', 'claimed', 'returned', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  claimant_id uuid not null references public.profiles(id) on delete cascade,
  claimant_name text not null,
  claimant_email text not null,
  message text not null check (length(btrim(message)) between 3 and 500),
  status text not null default 'pending' check (status in ('pending', 'awaiting_answer', 'answered', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (item_id, claimant_id)
);

create table if not exists public.claim_verifications (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null unique references public.claims(id) on delete cascade,
  question text not null check (length(btrim(question)) between 3 and 1000),
  response text check (response is null or length(response) <= 1000),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

-- New website sign-ups always start as regular members. Only a head can later grant invigilator access.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.school_settings
    where singleton = true and cardinality(allowed_email_domains) > 0
  ) and not exists (
    select 1 from public.school_settings
    where singleton = true
      and lower(split_part(coalesce(new.email, ''), '@', 2)) = any(allowed_email_domains)
  ) then
    raise exception 'Please use an email address allowed by your school.';
  end if;

  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'School member'),
    'member'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role helpers are SECURITY DEFINER to avoid recursively applying profiles RLS.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('invigilator', 'head')
  );
$$;

create or replace function public.is_head()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'head'
  );
$$;

revoke all on function public.is_staff() from public;
revoke all on function public.is_head() from public;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_head() to authenticated;

-- Take the signed-in user's display name and email from their account, not from the browser form.
create or replace function public.snapshot_claimant_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select p.display_name, p.email
  into new.claimant_name, new.claimant_email
  from public.profiles as p
  where p.id = new.claimant_id;

  if new.claimant_name is null or new.claimant_email is null then
    raise exception 'Claimant account profile was not found';
  end if;

  new.status := 'pending';
  return new;
end;
$$;

drop trigger if exists set_claimant_contact on public.claims;
create trigger set_claimant_contact
  before insert on public.claims
  for each row execute function public.snapshot_claimant_contact();

-- An approved claim marks the item claimed and closes other pending claims for that same item.
create or replace function public.handle_claim_decision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    update public.items set status = 'claimed' where id = new.item_id and status = 'open';
    update public.claims
      set status = 'rejected'
      where item_id = new.item_id and id <> new.id and status in ('pending', 'awaiting_answer', 'answered');
  end if;
  return new;
end;
$$;

drop trigger if exists apply_claim_decision on public.claims;
create trigger apply_claim_decision
  after update of status on public.claims
  for each row execute function public.handle_claim_decision();

-- Sending a claimant's answer automatically moves that claim into the staff decision queue.
create or replace function public.mark_verification_answered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.response is null and new.response is not null then
    update public.claims set status = 'answered'
    where id = new.claim_id and status = 'awaiting_answer';
  end if;
  return new;
end;
$$;

drop trigger if exists mark_claim_answered on public.claim_verifications;
create trigger mark_claim_answered
  after update of response on public.claim_verifications
  for each row execute function public.mark_verification_answered();

alter table public.profiles enable row level security;
alter table public.school_settings enable row level security;
alter table public.items enable row level security;
alter table public.claims enable row level security;
alter table public.claim_verifications enable row level security;

drop policy if exists "Members read their own profile, heads read team" on public.profiles;
create policy "Members read their own profile, heads read team"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_head()));

drop policy if exists "Heads can assign or remove invigilators" on public.profiles;
create policy "Heads can assign or remove invigilators"
  on public.profiles for update to authenticated
  using ((select public.is_head()))
  with check ((select public.is_head()) and role in ('member', 'invigilator'));

drop policy if exists "Signed-in members can view items" on public.items;
create policy "Signed-in members can view items"
  on public.items for select to authenticated using (true);

drop policy if exists "Members can report items as themselves" on public.items;
create policy "Members can report items as themselves"
  on public.items for insert to authenticated
  with check (reported_by = (select auth.uid()) and status = 'open');

drop policy if exists "Staff can update item status" on public.items;
create policy "Staff can update item status"
  on public.items for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists "Members can view their claims and staff can review all" on public.claims;
create policy "Members can view their claims and staff can review all"
  on public.claims for select to authenticated
  using (claimant_id = (select auth.uid()) or (select public.is_staff()));

drop policy if exists "Members can claim another person's found item" on public.claims;
create policy "Members can claim another person's found item"
  on public.claims for insert to authenticated
  with check (
    claimant_id = (select auth.uid())
    and status = 'pending'
    and exists (
      select 1 from public.items as i
      where i.id = item_id and i.kind = 'found' and i.status = 'open'
        and i.reported_by is distinct from (select auth.uid())
    )
  );

drop policy if exists "Staff can decide claims" on public.claims;
create policy "Staff can decide claims"
  on public.claims for update to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

drop policy if exists "Claimant and staff can read ownership checks" on public.claim_verifications;
create policy "Claimant and staff can read ownership checks"
  on public.claim_verifications for select to authenticated
  using (
    (select public.is_staff())
    or exists (
      select 1 from public.claims as c
      where c.id = claim_id and c.claimant_id = (select auth.uid())
    )
  );

drop policy if exists "Staff can create ownership checks" on public.claim_verifications;
create policy "Staff can create ownership checks"
  on public.claim_verifications for insert to authenticated
  with check (
    (select public.is_staff())
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.claims as c
      where c.id = claim_id and c.status = 'awaiting_answer'
    )
  );

drop policy if exists "Claimants can answer their ownership check" on public.claim_verifications;
create policy "Claimants can answer their ownership check"
  on public.claim_verifications for update to authenticated
  using (
    response is null
    and exists (
      select 1 from public.claims as c
      where c.id = claim_id and c.claimant_id = (select auth.uid()) and c.status = 'awaiting_answer'
    )
  )
  with check (
    response is not null and responded_at is not null
    and exists (
      select 1 from public.claims as c
      where c.id = claim_id and c.claimant_id = (select auth.uid()) and c.status = 'awaiting_answer'
    )
  );

-- Explicit table and column grants keep role, item status, and claim status changes narrow.
revoke all on table public.profiles, public.items, public.claims, public.claim_verifications from anon, authenticated;
revoke all on table public.school_settings from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (role) on table public.profiles to authenticated;
grant select on table public.items to authenticated;
grant insert (reported_by, kind, title, category, location, description, photo_path) on table public.items to authenticated;
grant update (status) on table public.items to authenticated;
grant select on table public.claims to authenticated;
grant insert (item_id, claimant_id, message) on table public.claims to authenticated;
grant update (status) on table public.claims to authenticated;
grant select on table public.claim_verifications to authenticated;
grant insert (claim_id, question, created_by) on table public.claim_verifications to authenticated;
grant update (response, responded_at) on table public.claim_verifications to authenticated;

-- Private image bucket: only signed-in school members can view, and uploads are kept in each user's folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-lost-found', 'school-lost-found', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "School members can view lost found photos" on storage.objects;
create policy "School members can view lost found photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'school-lost-found');

drop policy if exists "Members upload photos into their own folder" on storage.objects;
create policy "Members upload photos into their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'school-lost-found'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Members can remove their own uploaded photos" on storage.objects;
create policy "Members can remove their own uploaded photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'school-lost-found'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- After the first account signs up, run ONE of these in SQL Editor to assign head access:
-- update public.profiles set role = 'head' where lower(email) = lower('head@your-school.edu');
-- Heads can then grant/remove invigilator access from the website's Manage team tab.
-- Never set a website sign-up to head automatically.

-- Optional school email restriction (recommended before sharing the site):
-- update public.school_settings
-- set allowed_email_domains = array['your-school.edu', 'students.your-school.edu']
-- where singleton = true;
-- If the list is empty, any email address can create a regular member account.
