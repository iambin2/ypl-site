// Read-only snapshot of everything the site reads from Supabase.
// Run: node scripts/backup-data.mjs [outDir]
// Uses the public (anon) key from .env.production; tables that RLS hides from
// anon are reported, not silently skipped. Restoring is a manual, deliberate step.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const env = Object.fromEntries(readFileSync(".env.production", "utf8").split(/\r?\n/)
  .filter(line => /^[A-Z_]+=/.test(line)).map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]));
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY, schema = env.VITE_YPL_DATA_SCHEMA;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = process.argv[2] || join("..", `ypl-backup-${stamp}`);
mkdirSync(out, { recursive: true });

const TABLES = ["seasons", "players", "events", "event_registrations", "registration_submissions", "team_snapshots",
  "team_snapshot_members", "entries", "entry_participants", "bracket_runtimes", "bracket_entry_slots", "matches",
  "results", "ranking_awards", "ranking_baselines", "hall_of_fame_entries", "championship_advancements",
  "championship_qualifier_direct_selections"];

async function dump(table, profile) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*`, { headers: {
      apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": profile, Range: `${from}-${from + 999}`, "Range-Unit": "items" } });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const report = [];
for (const [table, profile] of [["site_data", "public"], ...TABLES.map(t => [t, schema])]) {
  try {
    const rows = await dump(table, profile);
    writeFileSync(join(out, `${profile}.${table}.json`), JSON.stringify(rows, null, 2));
    report.push(`${profile}.${table}: ${rows.length} rows`);
  } catch (error) {
    report.push(`${profile}.${table}: NOT BACKED UP (${error.message.slice(0, 120)})`);
  }
}
writeFileSync(join(out, "README.txt"), `YPL data snapshot ${new Date().toISOString()}\n\n${report.join("\n")}\n`);
console.log(out + "\n" + report.join("\n"));
