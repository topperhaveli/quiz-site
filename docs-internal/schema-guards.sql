-- Server-side guards live in the Supabase DB, not in Git. Re-apply after any DB reset/restore.
-- Applied 2026-10-21: admin_plan_history guard fix + leaderboard paid gate.

create or replace function public.admin_plan_history(p_id uuid)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  perform public._assert_admin();
  return (select coalesce(json_agg(row_to_json(t) order by t.created_at desc),'[]'::json) from (
    select action, days, from_until, to_until, note, amount, mode, created_at
    from plan_events where user_id=p_id order by created_at desc limit 50) t);
end
$function$;

create or replace function public.leaderboard()
returns table(user_id uuid, display_name text, answered bigint, correct bigint, pct numeric)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare me record;
begin
  select p.id, p.is_admin, p.is_paid, p.access_scope, p.paid_until into me from profiles p where p.id = auth.uid();
  if me.id is null or not (me.is_admin or (me.is_paid and (me.access_scope is null or me.access_scope = 'all') and (me.paid_until is null or me.paid_until > now()))) then
    raise exception 'paid only';
  end if;
  return query
  select a.user_id,
         case when p.id = auth.uid() then p.display_name
              else 'Student '||substr(p.id::text,1,4) end as display_name,
         count(*) as answered, sum(a.correct::int) as correct,
         round(100.0*sum(a.correct::int)/count(*),1) as pct
  from attempts a join profiles p on p.id = a.user_id
  where p.is_admin = false
  group by a.user_id, p.id, p.display_name;
end
$function$;
