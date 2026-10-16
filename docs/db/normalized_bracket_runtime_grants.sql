-- YPL normalized bracket runtime table privileges
-- Status: matches Production after the 2026-10-16 lockdown (access_lockdown.sql)
--
-- This file intentionally remains separate from the runtime DDL. Visitors only
-- read the immutable-fact tables; the signed-in admin (authenticated, gated by
-- RLS admin_write) inserts and deletes them. UPDATE stays forbidden.

grant select on table ypl_schema_validation.bracket_runtimes to anon;
grant select, insert, delete
on table ypl_schema_validation.bracket_runtimes
to authenticated;

grant select on table ypl_schema_validation.bracket_entry_slots to anon;
grant select, insert, delete
on table ypl_schema_validation.bracket_entry_slots
to authenticated;

grant select on table ypl_schema_validation.bracket_identity_changes to anon;
grant select, insert, delete
on table ypl_schema_validation.bracket_identity_changes
to authenticated;
