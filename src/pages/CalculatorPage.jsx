import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dropdown, Icon, Loader, PageHead, Reveal, STAGGER, Segmented } from "../components/index.js";
import PickerSheet, { PickField } from "../components/common/PickerSheet.jsx";
import { DEFAULT_REGULATION_ID, REGULATIONS, TYPE_OPTIONS } from "../data/index.js";
import { championsData } from "../services/index.js";
import {
  ALIGNMENTS,
  CATEGORY_KO,
  STAT_KEYS,
  STAT_LABELS,
  TEAM_STORAGE_KEY,
  TYPE_KO,
  abilityName,
  alignmentDisplay,
  bilingualName,
  championsPP,
  dexRecord,
  itemName,
  learnsetFor,
  localizedPokemonName,
  matchesPokemonSearch,
  memberFromSaved,
  moveEnglishName,
  moveName,
  normalizeSavedTeam,
  onSpriteError,
  pokemonPoolForRegulation,
  requiredItemForPokemon,
  spriteUrl,
} from "../services/teamBuilderCore.js";
import {
  BOOST_KEYS,
  CALC_STORAGE_KEY,
  FIELD_CONDITIONS,
  SIDE_CONDITIONS,
  SPEED_MODIFIERS,
  SPEED_SPREAD_LABELS,
  STATUS_OPTIONS,
  TERRAIN_OPTIONS,
  TOGGLE_ABILITIES,
  WEATHER_OPTIONS,
  applySpeedModifier,
  buildPokemon,
  damageFor,
  defensiveMatchups,
  emptyField,
  emptySide,
  normalizeField,
  normalizeSide,
  sideFromMember,
  spTotal,
  speedDuel,
  speedLines,
  statRange,
  weightMovePower,
  weightOf,
} from "../services/calculatorCore.js";

const REGULATION = REGULATIONS[DEFAULT_REGULATION_ID];
const SIDE_NAMES = ["내 포켓몬", "상대 포켓몬"];
const MULTIPLIER_LABELS = [["4", "4배"], ["2", "2배"], ["0.5", "0.5배"], ["0.25", "0.25배"], ["0", "무효"]];
const MOVE_SORTS = [
  { value: "name", label: "이름순" },
  { value: "power", label: "위력순" },
  { value: "type", label: "타입순" },
];
const toID = championsData.toID;
const signed = value => value > 0 ? `+${value}` : String(value);
// 받침이 있으면 앞의 조사, 없으면 뒤의 조사. 한글이 아닌 끝 글자는 받침 없음으로 읽는다.
const josa = (word, withFinal, withoutFinal) => {
  const code = String(word).charCodeAt(String(word).length - 1) - 0xAC00;
  return word + (code >= 0 && code <= 11171 && code % 28 ? withFinal : withoutFinal);
};

function readStored() {
  try {
    const raw = JSON.parse(localStorage.getItem(CALC_STORAGE_KEY) || "null");
    return {
      tab: ["damage", "speed", "dex"].includes(raw?.tab) ? raw.tab : "damage",
      sides: [normalizeSide(raw?.sides?.[0]), normalizeSide(raw?.sides?.[1])],
      field: normalizeField(raw?.field),
    };
  } catch {
    return { tab: "damage", sides: [emptySide(), emptySide()], field: emptyField() };
  }
}

function readSavedTeams() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TEAM_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeSavedTeam).filter(team => team?.members?.length) : [];
  } catch {
    return [];
  }
}

function TypeBadges({ types = [] }) {
  return <div className="tb-types">{types.map(type => <span key={type} className={`tb-type type-${toID(type)}`}>{TYPE_KO[type] || type}</span>)}</div>;
}

function Toggle({ on, onChange, children }) {
  return <button type="button" className={"calc-toggle press" + (on ? " on" : "")} aria-pressed={on} onClick={() => onChange(!on)}>{children}</button>;
}

function Stepper({ value, min, max, onChange, label }) {
  return (
    <div className="calc-stepper" role="group" aria-label={label}>
      <button type="button" className="press" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`${label} 내리기`}><Icon n="minus" size={14} /></button>
      <output className={value ? "on" : ""}>{signed(value)}</output>
      <button type="button" className="press" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`${label} 올리기`}><Icon n="plus" size={14} /></button>
    </div>
  );
}

/* 대미지 막대: 남는 HP(최소 대미지 기준)와 난수 폭, 사라지는 몫을 밝기 세 단계로 읽는다. */
function HpBar({ result }) {
  const left = (damage) => Math.max(0, result.curHP - damage) / result.hp;
  return (
    <div className="calc-hpbar" aria-hidden="true">
      <span className="calc-hp-range" style={{ transform: `scaleX(${left(result.min)})` }} />
      <span className="calc-hp-left" style={{ transform: `scaleX(${left(result.max)})` }} />
    </div>
  );
}

function ResultRow({ result, detailData, open, onToggle }) {
  const name = moveName(detailData, result.moveId);
  const meta = `${TYPE_KO[result.type] || result.type} ${CATEGORY_KO[result.category] || ""}${result.basePower ? `, 위력 ${result.basePower}` : ""}`;
  if (result.status || result.error) {
    return (
      <li className="calc-result quiet">
        <div className="calc-result-head"><span className="calc-result-move"><strong>{name}</strong><small>{meta}</small></span><span className="calc-result-ko">{result.status ? "변화 기술" : "계산할 수 없음"}</span></div>
      </li>
    );
  }
  return (
    <li className={"calc-result" + (open ? " open" : "")}>
      <button type="button" className="calc-result-head press" aria-expanded={open} onClick={onToggle}>
        <span className="calc-result-move"><strong>{name}</strong><small>{meta}</small></span>
        <span className="calc-result-pct">{result.max ? `${result.minPct} – ${result.maxPct}%` : "0%"}</span>
        <span className="calc-result-ko">{result.koText}</span>
      </button>
      {result.max > 0 && <HpBar result={result} />}
      {open && (
        <div className="calc-result-detail">
          <p>대미지 {result.min} – {result.max}, 상대 HP {result.curHP}{result.curHP !== result.hp ? ` / ${result.hp}` : ""}</p>
          <p className="calc-rolls">{result.rolls.join(", ")}</p>
        </div>
      )}
    </li>
  );
}

function DirectionResults({ title, results, detailData, emptyText }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="calc-direction">
      <h3>{title}</h3>
      {results.length ? (
        <ul className="calc-results">
          {results.map((result, index) => <ResultRow key={`${result.moveId}-${index}`} result={result} detailData={detailData} open={open === index} onToggle={() => setOpen(open === index ? null : index)} />)}
        </ul>
      ) : <p className="calc-empty">{emptyText}</p>}
    </div>
  );
}

function SideCard({ index, side, record, pokemon, detailData, legalItems, display, onChange, onPickPokemon, onImport, onClear, hasSavedTeams }) {
  const [picker, setPicker] = useState(null);
  const learnset = useMemo(() => learnsetFor(detailData, pokemon), [detailData, pokemon]);
  const lockedItem = requiredItemForPokemon(detailData, pokemon);
  const nature = ALIGNMENTS.find(entry => entry.id === side.nature) || ALIGNMENTS[0];
  const engine = useMemo(() => buildPokemon(detailData, record, side), [detailData, record, side]);
  const total = spTotal(side);
  const set = patch => onChange({ ...side, ...patch });
  const setSp = (key, value) => set({ sp: { ...side.sp, [key]: Math.max(0, Math.min(32, Math.round(Number(value) || 0))) } });
  const setBoost = (key, value) => set({ boosts: { ...side.boosts, [key]: value } });
  const ability = side.ability || record?.abilities?.[0] || "";

  const moveItems = useMemo(() => learnset.map(id => {
    const move = detailData?.moves?.[id];
    const korean = moveName(detailData, id);
    return {
      value: id, label: korean,
      sub: `${TYPE_KO[move?.type] || move?.type || ""} ${CATEGORY_KO[move?.category] || ""}${move?.category !== "Status" && move?.basePower ? `, 위력 ${move.basePower}` : ""}`,
      trailing: move?.category === "Status" ? null : move?.basePower || null,
      search: `${korean}${moveEnglishName(detailData, id)}`.toLowerCase().replace(/\s+/g, ""),
    };
  }).sort((a, b) => a.label.localeCompare(b.label, "ko")), [learnset, detailData]);
  const itemItems = useMemo(() => [
    { value: "", label: "도구 없음", search: "도구없음none" },
    ...legalItems.filter(item => !item.megaStone).map(item => ({ value: item.id, label: itemName(detailData, item.id), sub: item.name !== itemName(detailData, item.id) ? item.name : "", search: `${itemName(detailData, item.id)}${item.name}`.toLowerCase().replace(/\s+/g, "") }))
      .sort((a, b) => a.label.localeCompare(b.label, "ko")),
  ], [legalItems, detailData]);

  return (
    <div className="tb-panel calc-side" data-calc-side={index}>
      <div className="calc-side-head">
        {pokemon ? <button type="button" className="calc-mon press" onClick={onPickPokemon} aria-label={`${SIDE_NAMES[index]} 바꾸기`}>
          <img src={spriteUrl(pokemon.name)} alt="" onError={onSpriteError()} />
          <span className="calc-mon-copy">
            <strong>{display(pokemon)}</strong>
            <small>{SIDE_NAMES[index]}</small>
            {record && <TypeBadges types={record.types} />}
          </span>
        </button> : <p className="calc-side-empty">{SIDE_NAMES[index]}을 고르면 특성, 도구, 기술을 여기서 정합니다.</p>}
        {(hasSavedTeams || pokemon) && <div className="calc-side-actions">
          {hasSavedTeams && <button type="button" className="btn btn-ghost btn-sm" onClick={onImport}>내 팀에서</button>}
          {pokemon && <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>비우기</button>}
        </div>}
      </div>

      {pokemon && <>
        <div className="calc-grid">
          <label className="tb-field"><span>특성</span>
            <Dropdown className="tb-dd" value={ability} onChange={value => set({ ability: value, abilityOn: false })} ariaLabel="특성"
              options={(record?.abilities || []).map(entry => ({ value: entry, label: bilingualName(abilityName(entry), entry) }))} />
          </label>
          <label className="tb-field"><span>성격</span>
            <Dropdown className="tb-dd" value={side.nature} onChange={value => set({ nature: value })} ariaLabel="성격"
              options={ALIGNMENTS.map(entry => ({ value: entry.id, label: alignmentDisplay(entry) }))} />
          </label>
          <div className="tb-field"><span>도구</span>
            {lockedItem
              ? <div className="tb-locked-item"><span>{itemName(detailData, lockedItem)}</span><Icon n="lock" size={15} /></div>
              : <PickField label="도구" value={side.item ? itemName(detailData, side.item) : ""} placeholder="도구 없음" onOpen={() => setPicker("item")} />}
          </div>
          <label className="tb-field"><span>상태이상</span>
            <Dropdown className="tb-dd" value={side.status} onChange={value => set({ status: value })} ariaLabel="상태이상" options={STATUS_OPTIONS} />
          </label>
        </div>

        <div className="calc-hp">
          <span>남은 HP</span>
          <input type="range" min="1" max="100" value={side.hp} onChange={event => set({ hp: Number(event.target.value) })} aria-label="남은 HP 퍼센트" />
          <b>{side.hp}%{engine ? <small> {Math.max(1, Math.floor(engine.maxHP() * side.hp / 100))} / {engine.maxHP()}</small> : null}</b>
        </div>

        <div className="tb-editor-section calc-section">
          <div className="tb-subhead"><div><strong>능력 포인트와 랭크</strong><span>개별 최대 32, 총합 최대 66</span></div><b className={total > 66 ? "over" : ""}>{total} / 66</b></div>
          <div className="tb-stats">
            {STAT_KEYS.map(key => {
              const base = record?.baseStats?.[key];
              const final = engine?.rawStats?.[key];
              return (
                <div className="calc-stat-row" key={key}>
                  <div className="tb-stat-label"><strong>{STAT_LABELS[key]}{nature.plus === key ? " ↑" : nature.minus === key ? " ↓" : ""}</strong><span>종족값 {base ?? "—"}</span></div>
                  <input type="range" min="0" max="32" step="1" value={side.sp[key]} onChange={event => setSp(key, event.target.value)} aria-label={`${STAT_LABELS[key]} 능력 포인트 슬라이더`} />
                  <input className="tb-stat-number" type="number" min="0" max="32" step="1" inputMode="numeric" value={side.sp[key]} onChange={event => setSp(key, event.target.value)} aria-label={`${STAT_LABELS[key]} 능력 포인트`} />
                  {BOOST_KEYS.includes(key) ? <Stepper value={side.boosts[key]} min={-6} max={6} label={`${STAT_LABELS[key]} 랭크`} onChange={value => setBoost(key, value)} /> : <span />}
                  <strong className="calc-final">{final ?? "—"}</strong>
                </div>
              );
            })}
          </div>
        </div>

        <div className="tb-editor-section calc-section">
          <div className="tb-subhead"><div><strong>기술</strong><span>챔피언스에서 배우는 기술</span></div></div>
          <div className="calc-moves">
            {side.moves.map((id, slot) => {
              const move = detailData?.moves?.[id];
              return <PickField key={slot} label={`기술 ${slot + 1}`} value={id ? moveName(detailData, id) : ""} placeholder={`기술 ${slot + 1}`}
                typeId={toID(move?.type)} typeLabel={move ? TYPE_KO[move.type] : ""} onOpen={() => setPicker(slot)}
                onClear={() => set({ moves: side.moves.map((m, i) => i === slot ? "" : m) })} />;
            })}
          </div>
        </div>

        <div className="tb-editor-section calc-section">
          <div className="tb-subhead"><div><strong>조건</strong><span>이 포켓몬 쪽 필드에 걸린 효과</span></div></div>
          <div className="calc-toggles">
            <Toggle on={side.crit} onChange={on => set({ crit: on })}>급소</Toggle>
            {TOGGLE_ABILITIES.has(ability) && <Toggle on={side.abilityOn} onChange={on => set({ abilityOn: on })}>{abilityName(ability)} 발동</Toggle>}
            {SIDE_CONDITIONS.map(({ key, label }) => <Toggle key={key} on={Boolean(side.conds[key])} onChange={on => set({ conds: { ...side.conds, [key]: on } })}>{label}</Toggle>)}
          </div>
        </div>
      </>}

      {picker === "item" && <PickerSheet title="도구" placeholder="도구 검색" items={itemItems} selected={side.item} onPick={value => set({ item: value })} onClose={() => setPicker(null)} />}
      {typeof picker === "number" && <PickerSheet title={`기술 ${picker + 1}`} placeholder="기술 검색" items={moveItems} selected={side.moves[picker]}
        emptyText={learnset.length ? "검색 결과가 없습니다." : "배우는 기술 정보를 찾지 못했습니다."}
        onPick={value => set({ moves: side.moves.map((m, i) => i === picker ? value : (m === value ? "" : m)) })} onClose={() => setPicker(null)} />}
    </div>
  );
}

function FieldCard({ field, onChange }) {
  const set = patch => onChange({ ...field, ...patch });
  return (
    <div className="tb-panel">
      <div className="calc-field-grid">
        <Segmented value={field.format} onChange={value => set({ format: value })} ariaLabel="배틀 형식" options={[["Singles", "싱글"], ["Doubles", "더블"]]} />
        <Dropdown className="tb-dd" value={field.weather} onChange={value => set({ weather: value })} ariaLabel="날씨" options={WEATHER_OPTIONS} />
        <Dropdown className="tb-dd" value={field.terrain} onChange={value => set({ terrain: value })} ariaLabel="필드" options={TERRAIN_OPTIONS} />
      </div>
      <div className="calc-toggles">
        {FIELD_CONDITIONS.map(({ key, label }) => <Toggle key={key} on={Boolean(field.flags[key])} onChange={on => set({ flags: { ...field.flags, [key]: on } })}>{label}</Toggle>)}
      </div>
    </div>
  );
}

function DamageView({ sides, setSide, field, setField, records, pokemons, engines, detailData, legalItems, display, openPokemonPicker, openImport, hasSavedTeams }) {
  const [editing, setEditing] = useState(0);
  const results = [0, 1].map(from => {
    const to = 1 - from;
    return sides[from].moves.filter(Boolean).map(moveId => damageFor({
      detailData, attacker: engines[from], defender: engines[to], attackerSide: sides[from], defenderSide: sides[to], field, moveId,
    })).filter(Boolean);
  });
  const duel = speedDuel({ a: engines[0], b: engines[1], sideA: sides[0], sideB: sides[1], field });
  const nameOf = index => pokemons[index] ? display(pokemons[index]) : SIDE_NAMES[index];
  const ready = engines[0] && engines[1];
  const directionEmpty = from => !pokemons[from] ? `${SIDE_NAMES[from]}을 선택하세요.` : !pokemons[1 - from] ? `${SIDE_NAMES[1 - from]}을 선택하세요.` : "기술을 선택하면 대미지가 여기에 나옵니다.";
  return (
    <>
      <Reveal className="tb-panel" delay={STAGGER.row}>
        <div className="calc-versus">
          {[0, 1].map(index => (
            <button type="button" key={index} className="calc-versus-mon press" onClick={() => openPokemonPicker(index)}>
              {pokemons[index] ? <img src={spriteUrl(pokemons[index].name)} alt="" onError={onSpriteError()} /> : <span className="calc-mon-empty"><Icon n="plus" size={20} /></span>}
              <span><strong>{pokemons[index] ? nameOf(index) : `${SIDE_NAMES[index]} 선택`}</strong>{pokemons[index] && <small>{SIDE_NAMES[index]}</small>}</span>
            </button>
          ))}
        </div>
        {duel && (
          <div className="calc-speed-line">
            <span className="fig-pair"><b className={duel.first === "a" ? "on" : ""}>{duel.speedA}</b><i>스피드</i><b className={duel.first === "b" ? "on" : ""}>{duel.speedB}</b></span>
            <p>{duel.first === "tie" ? "스피드가 같아 먼저 움직일 쪽은 무작위입니다." : `${josa(nameOf(duel.first === "a" ? 0 : 1), "이", "가")} 먼저 움직입니다${duel.trickRoom ? " (트릭룸)" : ""}.`}</p>
          </div>
        )}
        <div className="calc-directions">
          <DirectionResults title={`${nameOf(0)}의 공격`} results={ready ? results[0] : []} detailData={detailData} emptyText={directionEmpty(0)} />
          <DirectionResults title={`${nameOf(1)}의 공격`} results={ready ? results[1] : []} detailData={detailData} emptyText={directionEmpty(1)} />
        </div>
      </Reveal>

      <Reveal delay={STAGGER.row * 2}><FieldCard field={field} onChange={setField} /></Reveal>

      <div className="calc-side-switch">
        <Segmented value={String(editing)} onChange={value => setEditing(Number(value))} ariaLabel="편집할 포켓몬" options={[["0", SIDE_NAMES[0]], ["1", SIDE_NAMES[1]]]} />
      </div>
      <Reveal className="calc-sides" delay={STAGGER.row * 3} data-editing={editing}>
        {[0, 1].map(index => (
          <SideCard key={index} index={index} side={sides[index]} record={records[index]} pokemon={pokemons[index]} detailData={detailData} legalItems={legalItems} display={display}
            onChange={next => setSide(index, next)} onPickPokemon={() => openPokemonPicker(index)} onImport={() => openImport(index)} hasSavedTeams={hasSavedTeams}
            onClear={() => setSide(index, { ...emptySide(), conds: sides[index].conds })} />
        ))}
      </Reveal>
    </>
  );
}

function SpeedView({ sides, engines, pokemons, pool, detailData, display, field, openPokemonPicker }) {
  const [basis, setBasis] = useState(0);
  const [spread, setSpread] = useState("max");
  const [modifier, setModifier] = useState("1");
  const [query, setQuery] = useState("");
  const meRef = useRef(null);
  const engine = engines[basis];
  const me = engine ? speedDuel({ a: engine, b: engine, sideA: sides[basis], sideB: sides[basis], field }).speedA : null;
  const rows = useMemo(() => {
    const seen = new Set();
    return pool.map(pokemon => {
      const record = dexRecord(detailData, pokemon);
      if (!record?.baseStats || seen.has(record.id)) return null;
      seen.add(record.id);
      return { pokemon, base: record.baseStats.spe, speed: speedLines(record.baseStats.spe, modifier)[spread] };
    }).filter(Boolean).sort((a, b) => b.speed - a.speed || b.base - a.base);
  }, [pool, detailData, spread, modifier]);
  const q = query.trim();
  const shown = q ? rows.filter(row => matchesPokemonSearch(row.pokemon, display(row.pokemon), q)) : rows;
  const faster = me == null ? 0 : rows.filter(row => row.speed > me).length;
  const ties = me == null ? 0 : rows.filter(row => row.speed === me).length;
  const meIndex = me == null ? -1 : shown.findIndex(row => row.speed <= me);

  const meRow = me == null ? null : (
    <li className="calc-tier me" ref={meRef} key="me">
      {pokemons[basis] && <img src={spriteUrl(pokemons[basis].name)} alt="" onError={onSpriteError()} />}
      <span className="calc-tier-copy"><strong>{display(pokemons[basis])}</strong><small>{SIDE_NAMES[basis]}, 현재 설정</small></span>
      <b>{me}</b>
    </li>
  );
  return (
    <>
      <Reveal className="tb-panel" delay={STAGGER.row}>
        <div className="calc-speed-basis">
          <Segmented value={String(basis)} onChange={value => setBasis(Number(value))} ariaLabel="기준 포켓몬" options={[["0", SIDE_NAMES[0]], ["1", SIDE_NAMES[1]]]} />
          {pokemons[basis] && me != null ? (
            <div className="calc-speed-me">
              <span className="fig">{me}</span>
              <p>{display(pokemons[basis])}의 스피드입니다. 비교한 {rows.length}마리 중 {faster}마리가 더 빠르고{ties ? `, ${ties}마리가 같습니다` : ""}.</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQuery(""); requestAnimationFrame(() => meRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })); }}>내 위치 보기</button>
            </div>
          ) : (
            <div className="calc-speed-me">
              <p>기준이 될 포켓몬을 고르면 스피드 라인 안의 위치를 보여 줍니다.</p>
              <button type="button" className="btn btn-sm" onClick={() => openPokemonPicker(basis)}>포켓몬 선택</button>
            </div>
          )}
        </div>
        <p className="calc-note">기준 포켓몬의 능력 포인트, 성격, 도구, 랭크, 순풍과 날씨는 대미지 탭의 설정을 그대로 씁니다.</p>
      </Reveal>

      <Reveal className="tb-panel" delay={STAGGER.row * 2}>
        <div className="calc-speed-controls">
          <Segmented value={spread} onChange={setSpread} ariaLabel="상대 스피드 기준" options={Object.entries(SPEED_SPREAD_LABELS)} />
          <Dropdown className="tb-dd" value={modifier} onChange={setModifier} ariaLabel="상대 스피드 보정" options={SPEED_MODIFIERS} />
        </div>
        <p className="calc-note">최속은 32포인트에 스피드 상승 성격, 준속은 32포인트에 무보정 성격, 무보정은 0포인트, 최저는 0포인트에 스피드 하락 성격입니다.</p>
        <div className="tb-search-row calc-tier-search">
          <span className="search-input-icon" aria-hidden="true"><Icon n="search" size={18} /></span>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="포켓몬 검색" aria-label="포켓몬 검색" autoComplete="off" />
          {query && <button type="button" className="tb-clear" onClick={() => setQuery("")} aria-label="검색어 지우기"><Icon n="x" size={12} /></button>}
        </div>
        <ol className="calc-tiers">
          {shown.map((row, index) => (
            <React.Fragment key={row.pokemon.name}>
              {index === meIndex && meRow}
              <li className={"calc-tier" + (me == null ? "" : row.speed > me ? " faster" : row.speed === me ? " tie" : " slower")}>
                <img src={spriteUrl(row.pokemon.name)} alt="" loading="lazy" decoding="async" onError={onSpriteError()} />
                <span className="calc-tier-copy"><strong>{display(row.pokemon)}</strong><small>종족값 {row.base}{me != null && row.speed === me ? ", 동속" : ""}</small></span>
                <b>{row.speed}</b>
              </li>
            </React.Fragment>
          ))}
          {meIndex === -1 && !q && meRow}
          {!shown.length && <p className="tb-pool-empty">검색 결과가 없습니다.</p>}
        </ol>
      </Reveal>
    </>
  );
}

function DexView({ pokemon, detailData, display, openPicker, onUse }) {
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sort, setSort] = useState("name");
  const [query, setQuery] = useState("");
  const record = dexRecord(detailData, pokemon);
  const learnset = useMemo(() => learnsetFor(detailData, pokemon), [detailData, pokemon]);
  const moves = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "");
    return learnset.map(id => ({ id, ...detailData?.moves?.[id], korean: moveName(detailData, id) }))
      .filter(move => (!typeFilter || toID(move.type) === typeFilter) && (!categoryFilter || move.category === categoryFilter))
      .filter(move => !q || `${move.korean}${move.name || ""}`.toLowerCase().replace(/\s+/g, "").includes(q))
      .sort((a, b) => sort === "power" ? (b.basePower || 0) - (a.basePower || 0) || a.korean.localeCompare(b.korean, "ko")
        : sort === "type" ? (TYPE_KO[a.type] || "").localeCompare(TYPE_KO[b.type] || "", "ko") || a.korean.localeCompare(b.korean, "ko")
          : a.korean.localeCompare(b.korean, "ko"));
  }, [learnset, detailData, typeFilter, categoryFilter, sort, query]);

  if (!pokemon || !record) {
    return (
      <Reveal className="tb-panel calc-dex-empty" delay={STAGGER.row}>
        <strong>도감에서 볼 포켓몬을 고르세요.</strong>
        <span>종족값, 레벨 50 실수치 범위, 타입 상성, 챔피언스에서 배우는 기술을 한 화면에 보여 줍니다.</span>
        <button type="button" className="btn tb-main-btn" onClick={openPicker}>포켓몬 선택</button>
      </Reveal>
    );
  }
  const weight = weightOf(record);
  const chart = defensiveMatchups(record.types);
  const total = STAT_KEYS.reduce((sum, key) => sum + (record.baseStats?.[key] || 0), 0);
  return (
    <>
      <Reveal className="tb-panel" delay={STAGGER.row}>
        <div className="tb-editor-head">
          <img src={spriteUrl(pokemon.name)} alt="" onError={onSpriteError()} />
          <div className="tb-editor-title">
            <h2>{display(pokemon)}</h2>
            {display(pokemon) !== record.name && <span>{record.name}</span>}
            <small>전국도감 {String(record.num).padStart(4, "0")}{weight != null ? `, ${weight}kg (안다리걸기 위력 ${weightMovePower(weight)})` : ""}</small>
            <TypeBadges types={record.types} />
          </div>
        </div>
        <div className="calc-dex-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={openPicker}>다른 포켓몬</button>
          <button type="button" className="btn btn-sm" onClick={() => onUse(0)}>내 포켓몬으로 계산</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUse(1)}>상대로 계산</button>
        </div>
      </Reveal>

      <div className="calc-dex-grid">
        <Reveal className="tb-panel" delay={STAGGER.row * 2}>
          <div className="tb-subhead"><div><strong>종족값</strong><span>오른쪽은 레벨 50 실수치 범위</span></div><b>합계 {total}</b></div>
          <div className="tb-stats">
            {STAT_KEYS.map(key => {
              const base = record.baseStats?.[key] ?? 0;
              const [low, high] = statRange(base, key);
              return (
                <div className="calc-base-row" key={key}>
                  <strong>{STAT_LABELS[key]}</strong>
                  <b>{base}</b>
                  <span className="calc-base-bar"><i style={{ width: `${Math.min(100, base / 2)}%` }} /></span>
                  <small>{low} – {high}</small>
                </div>
              );
            })}
          </div>
          <div className="tb-editor-section">
            <div className="tb-subhead"><div><strong>특성</strong></div></div>
            <ul className="calc-abilities">
              {record.abilities.map(ability => <li key={ability}><strong>{abilityName(ability)}</strong>{ability !== abilityName(ability) && <small>{ability}</small>}</li>)}
            </ul>
          </div>
        </Reveal>

        <Reveal className="tb-panel" delay={STAGGER.row * 3}>
          <div className="tb-subhead"><div><strong>방어 상성</strong><span>특성은 반영하지 않은 타입 상성</span></div></div>
          <div className="calc-matchups">
            {MULTIPLIER_LABELS.filter(([key]) => chart[key]?.length).map(([key, label]) => (
              <div className="calc-matchup" key={key}>
                <strong>{label}</strong>
                <TypeBadges types={chart[key]} />
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      <Reveal className="tb-panel" delay={STAGGER.row * 4}>
        <div className="tb-subhead"><div><strong>배우는 기술</strong><span>포켓몬 챔피언스 기준</span></div><b>{moves.length} / {learnset.length}</b></div>
        <div className="calc-move-tools">
          <div className="tb-search-row">
            <span className="search-input-icon" aria-hidden="true"><Icon n="search" size={18} /></span>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="기술 검색" aria-label="기술 검색" autoComplete="off" />
            {query && <button type="button" className="tb-clear" onClick={() => setQuery("")} aria-label="검색어 지우기"><Icon n="x" size={12} /></button>}
          </div>
          <Dropdown className="tb-dd" value={typeFilter} onChange={setTypeFilter} ariaLabel="기술 타입" options={[{ value: "", label: "모든 타입" }, ...TYPE_OPTIONS.map(type => ({ value: type.id, label: type.korean }))]} />
          <Dropdown className="tb-dd" value={categoryFilter} onChange={setCategoryFilter} ariaLabel="기술 분류" options={[{ value: "", label: "모든 분류" }, { value: "Physical", label: "물리" }, { value: "Special", label: "특수" }, { value: "Status", label: "변화" }]} />
          <Dropdown className="tb-dd" value={sort} onChange={setSort} ariaLabel="정렬" options={MOVE_SORTS} />
        </div>
        <div className="calc-table-wrap">
          <table className="calc-table">
            <thead><tr><th>기술</th><th>타입</th><th>분류</th><th className="num">위력</th><th className="num">명중</th><th className="num">PP</th></tr></thead>
            <tbody>
              {moves.map(move => (
                <tr key={move.id}>
                  <td><strong>{move.korean}</strong>{move.name && move.name !== move.korean && <small>{move.name}</small>}</td>
                  <td><span className={`tb-type type-${toID(move.type)}`}>{TYPE_KO[move.type] || move.type}</span></td>
                  <td>{CATEGORY_KO[move.category] || move.category}</td>
                  <td className="num">{move.category === "Status" || !move.basePower ? "" : move.basePower}</td>
                  <td className="num">{move.accuracy === true || move.accuracy == null ? "" : move.accuracy}</td>
                  <td className="num">{championsPP(move.pp) ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!moves.length && <p className="tb-pool-empty">조건에 맞는 기술이 없습니다.</p>}
        </div>
      </Reveal>
    </>
  );
}

export default function CalculatorPage() {
  const initial = useMemo(readStored, []);
  const [tab, setTab] = useState(initial.tab);
  const [sides, setSides] = useState(initial.sides);
  const [field, setField] = useState(initial.field);
  const [dexName, setDexName] = useState(initial.sides[0].name);
  const [detailData, setDetailData] = useState(null);
  const [detailStatus, setDetailStatus] = useState("loading");
  const [koreanNames, setKoreanNames] = useState(new Map());
  const [picker, setPicker] = useState(null);
  const [importFor, setImportFor] = useState(null);
  const savedTeams = useMemo(readSavedTeams, [importFor]);

  useEffect(() => {
    let cancelled = false;
    championsData.load().then(data => { if (!cancelled) { setDetailData(data); setDetailStatus("ready"); } })
      .catch(error => { console.error("Champions detail data unavailable:", error); if (!cancelled) setDetailStatus("error"); });
    championsData.loadSpeciesNames()
      .then(names => { if (!cancelled) setKoreanNames(names.koreanByEnglish); })
      .catch(error => console.warn("Korean species names unavailable:", error));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(CALC_STORAGE_KEY, JSON.stringify({ tab, sides, field })); } catch { /* 저장소가 없으면 이번 방문에만 기억한다 */ }
  }, [tab, sides, field]);

  const legalItems = useMemo(() => detailData ? championsData.legalItems(detailData, REGULATION.id) : [], [detailData]);
  const pool = useMemo(() => detailData ? pokemonPoolForRegulation(REGULATION, detailData, legalItems) : [], [detailData, legalItems]);
  const poolByName = useMemo(() => new Map(pool.map(pokemon => [pokemon.name, pokemon])), [pool]);
  const display = useMemo(() => pokemon => pokemon ? localizedPokemonName(pokemon, koreanNames) : "", [koreanNames]);
  const pokemons = sides.map(side => poolByName.get(side.name) || null);
  const records = pokemons.map(pokemon => dexRecord(detailData, pokemon));
  const engines = useMemo(() => sides.map((side, index) => buildPokemon(detailData, records[index], side)), [detailData, sides, records[0], records[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSide = (index, next) => setSides(current => current.map((side, i) => i === index ? next : side));
  const choosePokemon = (index, name) => {
    const pokemon = poolByName.get(name);
    const record = dexRecord(detailData, pokemon);
    const learnable = new Set(learnsetFor(detailData, pokemon));
    setSides(current => current.map((side, i) => {
      if (i !== index) return side;
      const sameSpecies = side.name && dexRecord(detailData, poolByName.get(side.name))?.baseSpecies === record?.baseSpecies;
      return {
        ...side,
        name,
        ability: record?.abilities?.[0] || "",
        abilityOn: false,
        item: requiredItemForPokemon(detailData, pokemon) || (sameSpecies && !requiredItemForPokemon(detailData, poolByName.get(side.name)) ? side.item : ""),
        moves: sameSpecies ? side.moves.map(id => learnable.has(id) ? id : "") : ["", "", "", ""],
      };
    }));
  };
  const useInCalculator = index => {
    if (!dexName) return;
    choosePokemon(index, dexName);
    setTab("damage");
  };

  const pokemonItems = useMemo(() => pool.map(pokemon => {
    const record = dexRecord(detailData, pokemon);
    const label = display(pokemon);
    return {
      value: pokemon.name, label, sub: label !== pokemon.name ? record?.name || pokemon.name : "",
      img: spriteUrl(pokemon.name), badges: <TypeBadges types={record?.types || []} />,
      match: query => matchesPokemonSearch(pokemon, label, query.trim()),
    };
  }).sort((a, b) => a.label.localeCompare(b.label, "ko")), [pool, detailData, display]);

  const importItems = useMemo(() => {
    if (importFor == null || !detailData) return [];
    return savedTeams.flatMap(team => team.members.map((saved, index) => {
      const member = memberFromSaved(saved, REGULATIONS[team.regulationId] || REGULATION, { detailData, legalItems });
      if (member.resolutionState !== "resolved" || !poolByName.has(member.pokemon.name)) return null;
      const label = display(member.pokemon);
      return {
        value: `${team.id}:${index}`, member, label, img: spriteUrl(member.pokemon.name),
        sub: `${team.name}${member.item ? `, ${itemName(detailData, member.item)}` : ""}`,
        search: `${label}${member.pokemon.name}${team.name}`.toLowerCase().replace(/\s+/g, ""),
      };
    })).filter(Boolean);
  }, [importFor, savedTeams, detailData, legalItems, poolByName, display]);

  const loading = detailStatus !== "ready";
  return (
    <section className="sec" data-tab={tab}>
      <PageHead plain="계산기" desc="포켓몬 챔피언스 레벨 50 기준으로 대미지, 스피드, 도감을 한 곳에서 확인합니다." />
      <div className="calc-body">
      <div className="calc-tabs">
        <Segmented value={tab} onChange={setTab} ariaLabel="계산기 보기" options={[["damage", "대미지"], ["speed", "스피드"], ["dex", "도감"]]} />
      </div>

      {detailStatus === "error" ? (
        <div className="tb-panel calc-dex-empty">
          <strong>포켓몬 데이터를 불러오지 못했습니다.</strong>
          <span>연결 상태를 확인한 뒤 다시 시도해 주세요.</span>
          <button type="button" className="btn tb-main-btn" onClick={() => window.location.reload()}>다시 시도</button>
        </div>
      ) : loading ? <Loader /> : (
        <div className="calc-swap swap" key={tab}>
          {tab === "damage" && <DamageView sides={sides} setSide={setSide} field={field} setField={setField} records={records} pokemons={pokemons} engines={engines}
            detailData={detailData} legalItems={legalItems} display={display} openPokemonPicker={setPicker} openImport={setImportFor} hasSavedTeams={savedTeams.length > 0} />}
          {tab === "speed" && <SpeedView sides={sides} engines={engines} pokemons={pokemons} pool={pool} detailData={detailData} display={display} field={field} openPokemonPicker={setPicker} />}
          {tab === "dex" && <DexView pokemon={poolByName.get(dexName) || null} detailData={detailData} display={display} openPicker={() => setPicker("dex")} onUse={useInCalculator} />}
        </div>
      )}
      </div>

      {picker != null && <PickerSheet title={picker === "dex" ? "도감" : SIDE_NAMES[picker]} placeholder="이름, 영문 이름 검색" items={pokemonItems}
        selected={picker === "dex" ? dexName : sides[picker]?.name}
        onPick={name => picker === "dex" ? setDexName(name) : choosePokemon(picker, name)} onClose={() => setPicker(null)} />}
      {importFor != null && <PickerSheet title="내 팀에서 불러오기" placeholder="포켓몬이나 팀 이름 검색" items={importItems}
        emptyText="팀 빌더에 저장한 팀이 없습니다."
        onPick={value => { const entry = importItems.find(item => item.value === value); if (entry) setSide(importFor, sideFromMember(entry.member)); }}
        onClose={() => setImportFor(null)} />}
    </section>
  );
}
