-- Run after an existing school-head account has been assigned the "head" role.
-- Student accounts can only be provisioned by the protected create-student-account Edge Function.

alter table public.profiles add column if not exists student_id text;

create unique index if not exists profiles_student_id_unique
  on public.profiles (lower(student_id))
  where student_id is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_student_id text := upper(btrim(coalesce(new.raw_user_meta_data ->> 'student_id', '')));
  normalized_display_name text := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');
begin
  if new.raw_app_meta_data ->> 'findback_account_type' is distinct from 'student' then
    raise exception 'New accounts must be created by the school head.';
  end if;

  if normalized_student_id = '' or length(normalized_student_id) > 50 then
    raise exception 'A valid student school ID is required.';
  end if;

  if normalized_display_name is null then
    raise exception 'A student name is required.';
  end if;

  insert into public.profiles (id, email, student_id, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    normalized_student_id,
    normalized_display_name,
    'member'
  );

  return new;
end;
$$;

-- Keep the profile trigger attached to the protected account creation path.
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Claims show a student's school ID in the existing contact field; no fake email is shown to staff.
create or replace function public.snapshot_claimant_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select p.display_name, coalesce(p.student_id, p.email)
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
