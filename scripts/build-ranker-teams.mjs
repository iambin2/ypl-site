// Builds src/data/ranker-teams.json and src/data/tower-tiers.json: the top singles teams of the ladder, which 도전의 탑's foe builders
// learn their shapes, pairs and kinds from (docs/BATTLE_STREAK.md 15장, towerBuild.mjs), and the six strength tiers of the species they
// bring (the draft and the swaps read them, 14장).
//
// Source: バトルデータベース チャンピオンズ (champs.pokedb.tokyo) open data, the season's top 1000 singles teams as six species and
// their items. Its terms allow programmatic download and ask an app with many users to keep the files on its own server, never fetch
// them from the users' devices: so this script fetches once and the result is committed.
//
//   node scripts/build-ranker-teams.mjs                   (fetches the seasons of the current regulation)
//   STATS_CACHE=<dir> node scripts/build-ranker-teams.mjs (keeps the downloads in <dir> and reads them from there next time)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Dex } from "@pkmn/sim";
import * as champions from "@pkmn/mods/champions";
import { formatId, setPool } from "../supabase/functions/battle/engine.mjs";
import { ratingOf, TIERS } from "../src/services/partyBalance.js";

// the regulation's seasons (M-C: M-6 to M-8; M-8 ends 2026-12-02, add 8 when its file is out)
const SEASONS = [6, 7];
const FORMAT = formatId("m-c", "singles");
const dex = Dex.mod("champions", champions);

const CACHE = process.env.STATS_CACHE;
async function season(n) {
  const file = CACHE && `${CACHE}/pokedb_s${n}_single.json`;
  if (file && existsSync(file)) return JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
  const res = await fetch(`https://champs.pokedb.tokyo/opendata/s${n}_single_ranked_teams.json`);
  if (!res.ok) throw new Error(`no open data for season ${n} (${res.status})`);
  const text = (await res.text()).replace(/^﻿/, "");
  if (file) { mkdirSync(CACHE, { recursive: true }); writeFileSync(file, text); }
  return JSON.parse(text);
}

// the forms the data names, by the form's Japanese name (the base form of a species with forms is the plain species)
const FORMS = {
  "ヒスイのすがた": "Hisui", "ガラルのすがた": "Galar", "アローラのすがた": "Alola", "メスのすがた": "F",
  "ヒートロトム": "Heat", "ウォッシュロトム": "Wash", "フロストロトム": "Frost", "スピンロトム": "Fan", "カットロトム": "Mow",
  "えいえんのはな": "Eternal", "ローなすがた": "Low-Key", "ファンシーなもよう": "Fancy", "パルデアのすがた・ブレイズしゅ": "Paldea-Blaze",
  "パルデアのすがた・ウォーターしゅ": "Paldea-Aqua", "パルデアのすがた・コンバットしゅ": "Paldea-Combat",
};
const PLAIN = new Set(["オスのすがた", "シールドフォルム", "ばけたすがた", "がんさくフォルム", "ハイなすがた", "ナイーブフォルム", ""]);
const BASE = new Map();
for (const s of dex.species.all()) if (!s.forme && s.num > 0 && !BASE.has(s.num)) BASE.set(s.num, s.name);
function speciesOf(p) {
  const base = BASE.get(Number(p.id.split("-")[0]));
  if (!base) return null;
  if (PLAIN.has(p.form)) return base;
  const forme = FORMS[p.form];
  const name = forme && dex.species.get(`${base}-${forme}`);
  return name?.exists ? name.name : null;
}

// items by their Japanese names; 持ち物なし and an empty item mean none (the set's own item is drawn then)
const ITEMS = {
  "オボンのみ": "Sitrus Berry", "たべのこし": "Leftovers", "きあいのタスキ": "Focus Sash", "こだわりスカーフ": "Choice Scarf",
  "こだわりハチマキ": "Choice Band", "こだわりメガネ": "Choice Specs", "とつげきチョッキ": "Assault Vest",
  "いのちのたま": "Life Orb", "ゴツゴツメット": "Rocky Helmet", "ふうせん": "Air Balloon", "のろいのおふだ": "Spell Tag",
  "ラムのみ": "Lum Berry", "カゴのみ": "Chesto Berry", "ひかりのねんど": "Light Clay", "くろいメガネ": "Black Glasses",
  "たつじんのおび": "Expert Belt", "シュカのみ": "Shuca Berry", "しろいハーブ": "White Herb", "しんぴのしずく": "Mystic Water",
  "ハバンのみ": "Haban Berry", "レッドカード": "Red Card", "グランドコート": "Terrain Extender", "とけないこおり": "Never-Melt Ice",
  "こうかくレンズ": "Wide Lens", "きせきのタネ": "Miracle Seed", "さらさらいわ": "Smooth Rock", "ピントレンズ": "Scope Lens",
  "しめったいわ": "Damp Rock", "あついいわ": "Heat Rock", "つめたいいわ": "Icy Rock", "ヨプのみ": "Chople Berry",
  "サイコシード": "Psychic Seed", "グラスシード": "Grassy Seed", "エレキシード": "Electric Seed", "ミストシード": "Misty Seed",
  "だっしゅつボタン": "Eject Button", "だっしゅつパック": "Eject Pack", "りゅうのキバ": "Dragon Fang", "くろいてっきゅう": "Iron Ball",
  "ようせいのハネ": "Fairy Feather", "でんきだま": "Light Ball", "オッカのみ": "Occa Berry", "メタルコート": "Metal Coat",
  "ロゼルのみ": "Roseli Berry", "くろおび": "Black Belt", "ノーマルジュエル": "Normal Gem", "カシブのみ": "Kasib Berry",
  "しめつけバンド": "Binding Band", "ものしりメガネ": "Wise Glasses", "ひかりのこな": "Bright Powder", "イトケのみ": "Passho Berry",
  "ビアーのみ": "Kebia Berry", "リリバのみ": "Babiri Berry", "せんせいのツメ": "Quick Claw", "メンタルハーブ": "Mental Herb",
  "ナモのみ": "Payapa Berry", "じしゃく": "Magnet", "ソクノのみ": "Wacan Berry", "リンドのみ": "Rindo Berry",
  "ヤチェのみ": "Yache Berry", "ホズのみ": "Chilan Berry", "バコウのみ": "Coba Berry", "タンガのみ": "Tanga Berry", "フィラのみ": "Figy Berry",
  "かたいいし": "Hard Stone", "やわらかいすな": "Soft Sand", "もくたん": "Charcoal", "どくバリ": "Poison Barb", "するどいくちばし": "Sharp Beak",
  "まがったスプーン": "Twisted Spoon", "ぎんのこな": "Silver Powder", "シルクのスカーフ": "Silk Scarf", "かいがらのすず": "Shell Bell",
  "ルカリオナイトＺ": "Lucarionite Z", "ガブリアスナイトＺ": "Garchompite Z", "アブソルナイトＺ": "Absolite Z",
  "リザードナイトＸ": "Charizardite X", "リザードナイトＹ": "Charizardite Y", "ライチュウナイトＸ": "Raichunite X", "ライチュウナイトＹ": "Raichunite Y",
  "グソクムシャナイト": "Golisopite", "ボーマンダナイト": "Salamencite", "フラエッテナイト": "Floettite", "メタグロスナイト": "Metagrossite",
  "カイリュナイト": "Dragoninite", "ゲンガナイト": "Gengarite", "カメックスナイト": "Blastoisinite", "マフォクシナイト": "Delphoxite",
  "ギャラドスナイト": "Gyaradosite", "ルカリオナイト": "Lucarionite", "メガニウムナイト": "Meganiumite", "ゲッコウガナイト": "Greninjite",
  "ピクシナイト": "Clefablite", "ラグラージナイト": "Swampertite", "セグレイブナイト": "Baxcalibrite", "ミミロップナイト": "Lopunnite",
  "バシャーモナイト": "Blazikenite", "クチートナイト": "Mawilite", "ムクホークナイト": "Staraptite", "スコヴィラナイト": "Scovillainite",
  "スターミナイト": "Starminite", "ジュペッタナイト": "Banettite", "ウツボットナイト": "Victreebelite", "キラフロルナイト": "Glimmoranite",
  "サーナイトナイト": "Gardevoirite", "ユキメノコナイト": "Froslassite", "フシギバナイト": "Venusaurite", "ヤドランナイト": "Slowbronite",
  "ガメノデスナイト": "Barbaracite", "ジュカインナイト": "Sceptilite", "バンギラスナイト": "Tyranitarite", "ガルーラナイト": "Kangaskhanite",
  "エアームドナイト": "Skarmorite", "カエンジシナイト": "Pyroarite", "ヘラクロスナイト": "Heracronite", "ドラミドナイト": "Dragalgite",
  "ハッサムナイト": "Scizorite", "ヤミラミナイト": "Sablenite", "エルレイドナイト": "Galladite", "チリーンナイト": "Chimechite",
  "ブリガロナイト": "Chesnaughtite", "ジジーロナイト": "Drampanite", "フーディナイト": "Alakazite", "デンリュウナイト": "Ampharosite",
  "ガブリアスナイト": "Garchompite", "ハガネールナイト": "Steelixite", "プテラナイト": "Aerodactylite", "ボスゴドラナイト": "Aggronite",
  "オニゴーリナイト": "Glalitite", "ユキノオナイト": "Abomasite", "チルタリスナイト": "Altarianite", "タブンネナイト": "Audinite",
  "サメハダナイト": "Sharpedonite", "ヘルガナイト": "Houndoominite", "ライボルトナイト": "Manectite", "チャーレムナイト": "Medichamite",
  "カイロスナイト": "Pinsirite", "ピジョットナイト": "Pidgeotite", "スピアナイト": "Beedrillite", "バクーダナイト": "Cameruptite",
};
const NONE = new Set(["", "持ち物なし"]);

const pool = new Set(setPool(FORMAT).map(e => e.species));
const missing = { species: new Map(), item: new Map() };
const count = (map, key) => map.set(key, (map.get(key) || 0) + 1);
const teams = [];
let dropped = 0;
for (const n of SEASONS) {
  const data = await season(n);
  for (const t of data.teams) {
    const team = [];
    for (const p of t.team) {
      const species = speciesOf(p);
      if (!species || !pool.has(species)) { count(missing.species, `${p.id} ${p.pokemon} ${p.form}`); break; }
      const item = NONE.has(p.item) ? "" : ITEMS[p.item];
      if (item === undefined) { count(missing.item, p.item); break; }
      if (item && !dex.items.get(item).exists) { count(missing.item, `${p.item} (${item})`); break; }
      team.push({ species, item });
    }
    if (team.length !== 6) { dropped++; continue; }
    teams.push({ season: `M-${n}`, rank: t.rank, rating: t.rating_value, team });
  }
}

/* the tiers the tower's own pool is split into: the species the teams bring, by their measured share (species-power.json), into six
   of equal size. The ladder's species gather in the upper tiers of the whole pool, so the whole pool's tiers would leave the lower
   rows of the draft short of candidates (14장) */
const species = [...new Set(teams.flatMap(t => t.team.map(m => m.species)))].sort((a, b) => ratingOf(FORMAT, b) - ratingOf(FORMAT, a) || a.localeCompare(b));
const tiers = Object.fromEntries(species.map((s, i) => [s, Math.floor((i * TIERS) / species.length)]));

const source = "バトルデータベース チャンピオンズ (champs.pokedb.tokyo) open data, top singles teams";
writeFileSync(new URL("../src/data/ranker-teams.json", import.meta.url), JSON.stringify({ source, built: new Date().toISOString().slice(0, 10), seasons: SEASONS.map(n => `M-${n}`), teams }) + "\n");
writeFileSync(new URL("../src/data/tower-tiers.json", import.meta.url), JSON.stringify(tiers) + "\n");
console.log(`${teams.length} teams, ${species.length} species, ${dropped} teams dropped`);
for (const [kind, map] of Object.entries(missing)) for (const [k, v] of map) console.log(`  unknown ${kind}: ${k} (${v})`);
