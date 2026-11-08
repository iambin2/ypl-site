-- Keep the existing battle seat/PIN/privacy flow. Match the qualifier's
-- selected topology before allowing another official battle to start.
begin;
do $patch$
declare f regprocedure; d text;
begin
  f:=to_regprocedure('public.battle_official_seat(uuid,text,text,text)');
  if f is null then return; end if;
  d:=pg_get_functiondef(f);
  d:=replace(d,'br.topology_kind = ''double_elimination''','br.topology_kind = v_event.competition_format');
  d:=replace(d,'coalesce(l.loss_count, 0) < 2',
    'coalesce(l.loss_count, 0) < (case when v_event.competition_format=''single_elimination'' then 1 else 2 end)');
  execute d;
end $patch$;
commit;
