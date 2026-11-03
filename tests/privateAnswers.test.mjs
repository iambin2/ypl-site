import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../docs/db/private_answers.sql", import.meta.url), "utf8");

test("parties are readable only once their event is revealed, or by an operator", () => {
  for (const table of ["team_snapshots", "team_snapshot_members"]) {
    const policy = sql.slice(sql.indexOf(`create policy public_read on ypl_schema_validation.${table}`));
    assert.match(policy, /^[^;]*snapshot_revealed\([^;]*is_ypl_admin\(\)/);
  }
  assert.match(sql, /e\.team_revealed_at is not null/);
});

test("only answers to public questions stay in readable places", () => {
  // unknown fields and fields without the public mark fall to the private side
  assert.match(sql, /coalesce\(bool_or\(x\.field ->> 'public' = 'true'\), false\)/);
  assert.match(sql, /create trigger split_registration_answers before insert or update of registration_data/);
  const rpc = sql.slice(sql.indexOf("create or replace function public.submit_announcement_response"));
  assert.match(rpc, /'answers', v_split\.public_answers/);
  assert.ok(rpc.indexOf("application_closed") < rpc.indexOf("update public.site_data"));
  // visitors may select (and see nothing); only operators pass the policy
  assert.match(sql, /create policy form_private_answers_admin on public\.form_private_answers for all to authenticated/);
  assert.doesNotMatch(sql, /grant (insert|update)[^;]*form_private_answers/);
  assert.match(sql, /create table if not exists ypl_backup\.site_data_20261104/);
});
