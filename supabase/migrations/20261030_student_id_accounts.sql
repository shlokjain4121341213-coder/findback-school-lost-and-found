-- A student can edit only their own claim, and only while it is still pending.
create or replace function public.edit_pending_claim_message(p_claim_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to edit a claim.';
  end if;
  if p_message is null or length(btrim(p_message)) not between 3 and 500 then
    raise exception 'Claim messages must be between 3 and 500 characters.';
  end if;

  update public.claims
  set message = btrim(p_message)
  where id = p_claim_id
    and claimant_id = (select auth.uid())
    and status = 'pending';

  if not found then
    raise exception 'Only the student who submitted this claim can edit it while it is waiting for staff.';
  end if;
end;
$$;

revoke all on function public.edit_pending_claim_message(uuid, text) from public, anon;
grant execute on function public.edit_pending_claim_message(uuid, text) to authenticated;
