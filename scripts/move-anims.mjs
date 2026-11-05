// How every move a Pokémon can know in Champions is staged, written from the game's own description of the move (PokeAPI flavour
// text, Scarlet/Violet and Sword/Shield, which the wikis quote): what the user does, how the move travels, where it lands.
// node scripts/build-move-fx.mjs reads this and writes src/data/move-fx.json; src/pages/battle/moveFx.js plays it.
//
// A spec is phases joined by "then"; a phase is a verb and its words:
//   hit <mark> [fast] [wrap] [jump] [above] [shadow] [spin] [rage] [gather] [low] [multi:N] [back] [item] [drain] [zap] [bow] [flex] [glide] [burrow] [stomp] [roll] [dance] [press] [leaves] [tall]
//        marks: body fang claw slash cross fist kick knee chop horn drill sting tail whip wing beak head slam hammer pincer palm arms brawl bone axe throw
//   shoot <shape> [N] [big] [fast] [arc] [pin]   shapes: seed rock boulder ice shard icicle needle scale dart arrow orb fireball item bouquet garbage salt apple star leaf feather bubble mud shell coin
//   rain <shape> [N] [ring]     drops from above on each target       spikes <shape>   jut from the floor under the target
//   beam [wide] | stream [mist] | bolt | sky | wave | wind [petal] | vortex [sand] | rings | pulse | blast | burst [big] | mind [big]
//   orb [big] | cut | drain | web | volcano | quake [stomp] | crack | erupt | squeeze | trap | clap | possess
//   on itself:  blades dance flex gears shell drum sigil focus harden speed charge heal roost sunheal rest wish protect endure guard spotlight sub morph aura
//   at another: wisp zap splash powder yawn hypnosis notes charm tears confuse anger chain glare seed cloud curse link swap gust clear hazard weather terrain room screen hex steal lock
export const ANIMS = {
  // ---------- physical: Bug, Dark, Dragon, Electric, Fairy, Fighting, Fire, Flying, Ghost, Grass, Ground, Ice, Normal, Poison, Psychic, Rock, Steel, Water ----------
  bugbite: "hit fang", fellstinger: "hit sting", firstimpression: "hit body fast wrap", leechlife: "hit fang drain", lunge: "hit body", megahorn: "hit horn wrap",
  pinmissile: "shoot needle 5", pounce: "hit body jump", skittersmack: "hit body shadow", uturn: "hit body back", xscissor: "hit cross",
  assurance: "hit body", beatup: "hit body multi:3", bite: "hit fang", brutalswing: "hit tail spin", ceaselessedge: "hit slash", comeuppance: "hit body wrap",
  crunch: "hit fang", darkestlariat: "hit arms spin", fling: "shoot item", foulplay: "hit body shadow", jawlock: "hit fang", knockoff: "hit palm item",
  kowtowcleave: "hit slash bow", lashout: "hit body rage", nightslash: "hit slash fast", payback: "hit body gather", powertrip: "hit body flex", suckerpunch: "hit fist shadow fast",
  thief: "hit body item", throatchop: "hit chop", breakingswipe: "hit tail spin", dragonclaw: "hit claw", dragondarts: "shoot dart 2", dragonrush: "hit body wrap",
  dragontail: "hit tail", glaiverush: "hit body wrap", outrage: "hit body rage wrap", scaleshot: "shoot scale 4", aurawheel: "hit body spin wrap", doubleshock: "hit body wrap zap",
  nuzzle: "hit body zap", supercellslam: "hit body above wrap", thunderfang: "hit fang", thunderpunch: "hit fist", volttackle: "hit body wrap", wildcharge: "hit body wrap", zingzap: "hit body wrap zap",
  playrough: "hit brawl", spiritbreak: "hit body wrap", axekick: "hit kick jump", bodypress: "hit body jump", brickbreak: "hit chop", circlethrow: "hit throw",
  closecombat: "hit fist multi:5", counter: "hit body wrap", crosschop: "hit cross", drainpunch: "hit fist drain", dynamicpunch: "hit fist gather", flyingpress: "hit body above",
  focuspunch: "hit fist gather", hammerarm: "hit hammer", highjumpkick: "hit knee jump", lowkick: "hit kick low", lowsweep: "hit kick low", machpunch: "hit fist fast",
  meteorassault: "hit slash", reversal: "hit body wrap", sacredsword: "hit slash", seismictoss: "hit throw", stormthrow: "hit throw", superpower: "hit body flex",
  triplearrows: "hit kick then shoot arrow 3", upperhand: "hit palm fast", bitterblade: "hit slash drain", blazekick: "hit kick", firefang: "hit fang", firelash: "hit whip",
  firepunch: "hit fist", flamecharge: "hit body wrap", flareblitz: "hit body wrap", heatcrash: "hit body jump wrap", pyroball: "shoot fireball", ragingfury: "hit body rage wrap",
  temperflare: "hit body wrap", acrobatics: "hit wing fast", aerialace: "hit slash fast", beakblast: "hit beak gather", bounce: "hit body above", bravebird: "hit body wrap",
  drillpeck: "hit drill", dualwingbeat: "hit wing multi:2", fly: "hit body above", pluck: "hit beak", skyattack: "hit body wrap gather", lastrespects: "hit body wrap",
  phantomforce: "hit body shadow", poltergeist: "possess", ragefist: "hit fist rage", shadowclaw: "hit claw", shadowpunch: "hit fist shadow", shadowsneak: "hit body shadow fast",
  spiritshackle: "shoot arrow pin", bulletseed: "shoot seed 5", drumbeating: "spikes root", flowertrick: "shoot bouquet", grassyglide: "hit body glide", gravapple: "rain apple 1",
  hornleech: "hit horn drain", leafblade: "hit slash", petalblizzard: "wind petal", powerwhip: "hit whip", seedbomb: "rain seed 4", solarblade: "hit slash gather",
  trailblaze: "hit body leaves", tropkick: "hit kick", woodhammer: "hit body jump", bonerush: "hit bone multi:3", bulldoze: "quake stomp", dig: "hit body burrow",
  drillrun: "hit drill spin", earthquake: "quake", fissure: "crack", headlongrush: "hit body wrap", highhorsepower: "hit body stomp", sandtomb: "vortex sand",
  stompingtantrum: "hit body stomp", avalanche: "rain ice 4", icefang: "hit fang", icehammer: "hit hammer", icepunch: "hit fist", iceshard: "shoot shard 3 fast",
  icespinner: "hit body spin", iciclecrash: "rain icicle 3", iciclespear: "shoot icicle 4", mountaingale: "shoot ice 2 big", tripleaxel: "hit kick spin multi:3",
  bind: "squeeze", bodyslam: "hit body jump", covet: "hit body item", crushclaw: "hit claw", doubleedge: "hit body wrap", doublehit: "hit tail multi:2", endeavor: "hit body",
  explosion: "burst big", extremespeed: "hit body fast", facade: "hit body", fakeout: "clap", feint: "hit body fast", flail: "hit body multi:3", gigaimpact: "hit body wrap",
  guillotine: "hit pincer", horndrill: "hit drill", lastresort: "hit body wrap", megakick: "hit kick", populationbomb: "hit body multi:6", quickattack: "hit body fast",
  ragingbull: "hit horn wrap", rapidspin: "hit body spin", selfdestruct: "burst", slash: "hit slash", superfang: "hit fang", tailslap: "hit tail multi:3", thrash: "hit body rage", wrap: "squeeze",
  barbbarrage: "shoot needle 6", crosspoison: "hit cross", direclaw: "hit claw", gunkshot: "shoot garbage big", mortalspin: "hit body spin", poisonfang: "hit fang", poisonjab: "hit sting",
  psychicfangs: "hit fang", psychocut: "cut", psyshieldbash: "hit body wrap", zenheadbutt: "hit head gather", accelerock: "hit body fast", headsmash: "hit head wrap",
  rockblast: "shoot rock 4", rockslide: "rain boulder 4", rocktomb: "rain boulder 3 ring", rockwrecker: "shoot boulder big", saltcure: "shoot salt", smackdown: "shoot rock",
  stoneaxe: "hit axe", stoneedge: "spikes stone", bulletpunch: "hit fist fast multi:2", gigatonhammer: "hit hammer jump", gyroball: "hit body spin", hardpress: "hit palm press",
  heavyslam: "hit body jump", ironhead: "hit head", irontail: "hit tail", metalburst: "shoot orb 3", meteormash: "hit fist wrap fast", smartstrike: "hit horn", snaptrap: "trap",
  steelroller: "hit body roll", steelwing: "hit wing", aquacutter: "cut", aquajet: "hit body fast wrap", aquastep: "hit kick dance", aquatail: "hit tail wrap",
  crabhammer: "hit pincer", dive: "hit body burrow", flipturn: "hit body back", jetpunch: "hit fist fast wrap", liquidation: "hit body wrap", razorshell: "hit slash", waterfall: "hit body wrap",
  // ---------- special ----------
  wavecrash: "hit body wrap", bugbuzz: "rings", infestation: "vortex", pollenpuff: "orb", strugglebug: "wind", darkpulse: "pulse", nightdaze: "pulse big", snarl: "rings",
  clangingscales: "rings", dracometeor: "rain comet 4", dragonpulse: "pulse", ficklebeam: "beam", chargebeam: "beam", discharge: "burst", electroball: "orb",
  electroshot: "beam wide gather", electroweb: "web", overdrive: "rings", paraboliccharge: "burst drain", risingvoltage: "erupt", thunder: "sky", thunderbolt: "bolt",
  voltswitch: "bolt back", zapcannon: "orb big", alluringvoice: "rings", dazzlinggleam: "flash", drainingkiss: "drain kiss", lightofruin: "beam wide", mistyexplosion: "burst big",
  moonblast: "moon", aurasphere: "orb", finalgambit: "hit body wrap", focusblast: "orb big gather", vacuumwave: "pulse fast", armorcannon: "shoot fireball 3 big",
  blastburn: "blast", burningjealousy: "flash", burnup: "blast", eruption: "volcano", fierydance: "stream dance", fireblast: "blast", firespin: "vortex", flamethrower: "stream",
  heatwave: "wind", inferno: "vortex big", lavaplume: "burst", mysticalfire: "stream", overheat: "blast", torchsong: "stream", aircutter: "cut", airslash: "cut",
  hurricane: "vortex", bittermalice: "pulse", hex: "hex", infernalparade: "shoot fireball 5", nightshade: "mind", shadowball: "orb", appleacid: "splash", energyball: "orb",
  frenzyplant: "spikes root", gigadrain: "drain", grassknot: "trap", leafstorm: "vortex", matchagotcha: "stream", petaldance: "wind petal", solarbeam: "beam wide gather",
  syrupbomb: "orb", earthpower: "erupt", mudshot: "shoot mud", mudslap: "shoot mud 2 fast", scorchingsands: "wind", blizzard: "wind", freezedry: "frost",
  frostbreath: "stream", icebeam: "beam", icywind: "wind", sheercold: "frost big", boomburst: "rings big", hyperbeam: "beam wide", hypervoice: "rings", round: "rings",
  snore: "rings", spitup: "orb", terrainpulse: "pulse", triattack: "beam tri", uproar: "rings", weatherball: "orb", acidspray: "splash", belch: "stream",
  clearsmog: "shoot mud", shellsidearm: "shoot shell", sludgebomb: "orb", sludgewave: "wave", venoshock: "splash", eeriespell: "mind", expandingforce: "mind big",
  extrasensory: "mind", futuresight: "mind", luminacrash: "beam wide", mirrorcoat: "beam", psychic: "mind", psychicnoise: "rings", psyshock: "pulse", storedpower: "orb",
  twinbeam: "beam twin", ancientpower: "shards", meteorbeam: "beam wide gather", powergem: "shards", flashcannon: "beam gather", makeitrain: "rain coin 7", steelbeam: "beam wide",
  chillingwater: "stream", hydrocannon: "stream big", hydropump: "stream big", muddywater: "wave", scald: "stream", snipeshot: "shoot water fast", sparklingaria: "rings",
  surf: "wave", waterpulse: "pulse", watershuriken: "shoot star 3 fast", waterspout: "volcano", whirlpool: "vortex",
  // ---------- status ----------
  quiverdance: "dance", ragepowder: "spotlight", stickyweb: "hazard", stringshot: "web", faketears: "tears", flatter: "confuse", memento: "curse", nastyplot: "sigil",
  partingshot: "rings", quash: "chain", switcheroo: "swap", taunt: "anger", topsyturvy: "confuse", torment: "anger", clangoroussoul: "flex", dragoncheer: "aura",
  dragondance: "dance", charge: "charge", eerieimpulse: "zap", electricterrain: "terrain", electrify: "zap", magneticflux: "charge", magnetrise: "aura", thunderwave: "zap",
  aromaticmist: "aura", babydolleyes: "charm", charm: "charm",
  decorate: "charm", fairylock: "lock", mistyterrain: "terrain", moonlight: "sunheal", sweetkiss: "charm", bulkup: "flex", coaching: "flex", detect: "protect",
  noretreat: "flex", octolock: "squeeze", quickguard: "guard", sunnyday: "weather", willowisp: "wisp", defog: "gust", featherdance: "feathers", roost: "roost",
  tailwind: "gust", confuseray: "confuse", curse: "curse", destinybond: "link", spite: "curse", trickortreat: "curse", cottonguard: "harden", cottonspore: "powder",
  forestscurse: "curse", grassyterrain: "terrain", growth: "flex", ingrain: "aura", leechseed: "seed", sleeppowder: "powder", spicyextract: "splash", spikyshield: "protect",
  strengthsap: "drain", stunspore: "powder", synthesis: "sunheal", worryseed: "seed", spikes: "hazard", auroraveil: "screen", chillyreception: "weather", haze: "clear",
  snowscape: "weather", acupressure: "focus", afteryou: "clap", attract: "charm", batonpass: "aura", bellydrum: "drum", block: "chain", copycat: "aura", courtchange: "swap",
  disable: "chain", doubleteam: "speed", encore: "clap", endure: "endure", entrainment: "dance", focusenergy: "focus", followme: "spotlight", glare: "glare", healbell: "notes",
  helpinghand: "clap", howl: "flex", lockon: "glare", meanlook: "glare", milkdrink: "heal", minimize: "harden", morningsun: "sunheal", nobleroar: "rings", painsplit: "drain",
  perishsong: "notes", protect: "protect", psychup: "sigil", recover: "heal", recycle: "aura", reflecttype: "swap", revivalblessing: "wish", roar: "rings", safeguard: "screen",
  scaryface: "glare", screech: "rings", shedtail: "sub", shellsmash: "shell", simplebeam: "pulse", sing: "notes", slackoff: "heal", sleeptalk: "rest", stockpile: "harden",
  stuffcheeks: "heal", substitute: "sub", swagger: "confuse", swallow: "heal", sweetscent: "cloud", swordsdance: "blades", tearfullook: "tears", teatime: "heal",
  teeterdance: "confuse", tickle: "charm", tidyup: "gust", transform: "morph", whirlwind: "gust", wish: "wish", yawn: "yawn", acidarmor: "harden", banefulbunker: "protect",
  coil: "flex", corrosivegas: "cloud", gastroacid: "splash", poisonpowder: "powder", toxic: "splash", toxicspikes: "hazard", toxicthread: "web", agility: "speed",
  allyswitch: "swap", amnesia: "sigil", calmmind: "sigil", cosmicpower: "harden", gravity: "room", guardsplit: "swap", guardswap: "swap", healingwish: "wish", healpulse: "pulse",
  hypnosis: "hypnosis", imprison: "sigil", instruct: "clap", lightscreen: "screen", magicpowder: "powder", magicroom: "room", powersplit: "swap", powerswap: "swap",
  powertrick: "swap", psychicterrain: "terrain", reflect: "screen", rest: "rest", roleplay: "swap", skillswap: "swap", speedswap: "swap", trick: "swap", trickroom: "room",
  wonderroom: "room", rockpolish: "speed", sandstorm: "weather", stealthrock: "hazard", wideguard: "guard", irondefense: "harden", kingsshield: "protect", metalsound: "rings",
  shelter: "harden", shiftgear: "gears", aquaring: "aura", lifedew: "heal", raindance: "weather", soak: "splash",
};
