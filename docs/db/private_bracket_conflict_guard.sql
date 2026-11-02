create or replace function public.community_write(
  p_action text,
  p_board text,
  p_id text,
  p_parent_id text,
  p_payload jsonb,
  p_secret boolean,
  p_pin text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := ypl_schema_validation.is_ypl_admin();
  v_item public.community_items%rowtype;
  v_parent public.community_items%rowtype;
  v_pin text := nullif(p_pin, '');
  v_status text;
  c_reserved constant text[] := array['id', 'pin', 'pinHash', 'comments', 'secret', 'createdAt', 'hasPin', '_expectedUpdatedAt'];
begin
  if p_action = 'create' then
    if p_board not in ('free', 'showcase', 'private_bracket')
       or coalesce(p_id, '') !~ '^[a-z0-9]{4,40}$'
       or jsonb_typeof(p_payload) is distinct from 'object' then
      raise exception using errcode = 'P0001', message = '저장할 글이 올바르지 않습니다.';
    end if;
    if v_pin is not null and v_pin !~ '^[0-9]{4}$' then
      raise exception using errcode = 'P0001', message = '비밀번호는 숫자 4자리로 입력해 주세요.';
    end if;
    if p_board = 'private_bracket' and p_parent_id is null and v_pin is null then
      raise exception using errcode = 'P0001', message = '관리 비밀번호를 입력해 주세요.';
    end if;
    if p_parent_id is not null then
      select * into v_parent from public.community_items i
       where i.id = p_parent_id and i.board = p_board and i.parent_id is null;
      if not found then
        raise exception using errcode = 'P0001', message = '글을 찾을 수 없습니다.';
      end if;
    end if;
    if not v_admin then
      perform pg_advisory_xact_lock(hashtext('community_write'));
      if (select count(*) from public.community_items i where i.created_at > now() - interval '1 minute') >= 20 then
        raise exception using errcode = 'P0001', message = '글이 많이 올라오고 있습니다. 잠시 뒤 다시 시도해 주세요.';
      end if;
      if (select count(*) from public.community_items i where i.board = p_board) >= 3000 then
        raise exception using errcode = 'P0001', message = '저장 공간이 가득 찼습니다. 관리자에게 오래된 글 정리를 요청해 주세요.';
      end if;
    end if;
    insert into public.community_items (id, board, parent_id, payload, secret, has_pin)
    values (p_id, p_board, p_parent_id, case when p_board='private_bracket' then
              (p_payload - c_reserved) || jsonb_build_object('updatedAt',clock_timestamp())
            else p_payload - c_reserved end,
            coalesce(v_parent.secret, p_secret, false), v_pin is not null);
    if v_pin is not null then
      insert into public.visitor_pins (scope, subject, pin_hash)
      values ('community', p_id, public.visitor_pin_hash(p_id, v_pin));
    end if;
    return 'ok';
  end if;

  if p_action not in ('verify', 'update', 'delete') then
    raise exception using errcode = 'P0001', message = '알 수 없는 요청입니다.';
  end if;
  select * into v_item from public.community_items i where i.id = p_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = '삭제되었거나 찾을 수 없는 글입니다.';
  end if;
  if not v_admin then
    v_status := public.visitor_pin_check('community', p_id, v_pin);
    if v_status <> 'ok' then return v_status; end if;
  end if;

  if p_action = 'update' then
    if jsonb_typeof(p_payload) is distinct from 'object' then
      raise exception using errcode = 'P0001', message = '저장할 글이 올바르지 않습니다.';
    end if;
    -- The row lock serializes saves; the token also rejects an older reader.
    -- Old clients without a token must refresh instead of overwriting results.
    if v_item.board='private_bracket' and
       (not (p_payload ? '_expectedUpdatedAt') or
        p_payload->'_expectedUpdatedAt' is distinct from coalesce(v_item.payload->'updatedAt','null'::jsonb)) then
      return 'stale';
    end if;
    update public.community_items i
       set payload = i.payload || (p_payload - c_reserved) || case when i.board='private_bracket'
             then jsonb_build_object('updatedAt',clock_timestamp()) else '{}'::jsonb end,
           secret = coalesce(p_secret, i.secret)
     where i.id = p_id;
    if p_secret is not null then
      update public.community_items i set secret = p_secret where i.parent_id = p_id;
    end if;
  elsif p_action = 'delete' then
    delete from public.visitor_pins p
     where p.scope = 'community'
       and p.subject in (select i.id from public.community_items i where i.id = p_id or i.parent_id = p_id);
    delete from public.community_items i where i.id = p_id;
  end if;
  return 'ok';
end;
$$;
revoke all on function public.community_write(text, text, text, text, jsonb, boolean, text) from public, anon, authenticated;
grant execute on function public.community_write(text, text, text, text, jsonb, boolean, text) to anon, authenticated;
