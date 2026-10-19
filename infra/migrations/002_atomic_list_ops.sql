-- Make list batches atomic and align MemoryStore/SupabaseStore semantics.
-- Apply after 001_v3.sql. The application calls this only through the service-role client.
create or replace function public.apply_list_ops(
  p_user_id text,
  p_list text,
  p_ops jsonb
)
returns table(item text, created_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_op jsonb;
  v_action text;
  v_item text;
  v_key text;
begin
  if p_user_id is null or p_user_id = '' or p_list is null or p_list = '' then
    raise exception 'user and list are required';
  end if;
  if jsonb_typeof(p_ops) is distinct from 'array' then
    raise exception 'list operations must be a JSON array';
  end if;

  for v_op in select value from jsonb_array_elements(p_ops) as entries(value)
  loop
    v_action := v_op ->> 'op';
    v_item := btrim(coalesce(v_op ->> 'item', ''));
    v_key := coalesce(v_op ->> 'dedupe_key', '');

    if v_action is null or v_action not in ('add', 'remove') then
      raise exception 'invalid list operation';
    end if;
    if v_item = '' or v_key = '' then
      continue;
    end if;

    if v_action = 'add' then
      insert into public.list_items (user_id, list, item, dedupe_key)
      values (p_user_id, p_list, v_item, v_key)
      on conflict (user_id, list, dedupe_key) do nothing;
    else
      delete from public.list_items as li
      where li.user_id = p_user_id
        and li.list = p_list
        and li.dedupe_key = v_key;
    end if;
  end loop;

  return query
    select li.item, li.created_at
    from public.list_items as li
    where li.user_id = p_user_id and li.list = p_list
    order by li.created_at, li.id;
end;
$$;

revoke all on function public.apply_list_ops(text, text, jsonb) from public;
revoke all on function public.apply_list_ops(text, text, jsonb) from anon, authenticated;
grant execute on function public.apply_list_ops(text, text, jsonb) to service_role;
