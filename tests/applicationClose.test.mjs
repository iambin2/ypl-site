import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../docs/db/application_close.sql", import.meta.url), "utf8");

test("applications close on the server at the notice's closesAt, read in Korean time", () => {
  for (const pattern of [
    /v::timestamp at time zone 'Asia\/Seoul'/,
    /exception when others then\s+return true;/,
    /create trigger guard_application_close before insert on ypl_schema_validation\.event_registrations/,
    /new\.registration_source is distinct from 'application' or \(select ypl_schema_validation\.is_ypl_admin\(\)\)/,
    /new\.event_id in \(li\.master_event_id, li\.rookie_event_id\)/,
    /security invoker/,
  ]) assert.match(sql, pattern);
  // the unlinked form's RPC checks the close before it appends, with the same message as the trigger
  const rpc = sql.slice(sql.indexOf("create or replace function public.submit_announcement_response"));
  assert.ok(rpc.indexOf("application_closed") < rpc.indexOf("update public.site_data"));
  assert.equal(sql.match(/message = '신청이 마감되었습니다\.'/g).length, 2);
});
