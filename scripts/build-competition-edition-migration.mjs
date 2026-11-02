// Emits the exact atomic migration without replacing unrelated Champions RPCs.
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(`../docs/db/${file}`,import.meta.url),'utf8');
const champions=read('champions_application_event_pair_rpc.sql');
const first=champions.indexOf('create or replace function');
const end=champions.indexOf('$$;',first)+3;
if(end<3)throw new Error('Champions pair function boundary not found');
const strip=sql=>sql.replace(/^begin;\r?\n/m,'').replace(/^commit;\s*$/m,'');
process.stdout.write([read('competition_editions.sql'),strip(read('league_intake.sql')),champions.slice(first,end),"notify pgrst, 'reload schema';"].join('\n\n')+'\n');
