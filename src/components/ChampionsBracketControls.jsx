import React, { useEffect, useState } from "react";
import {
  completeChampionshipQualifier,
  deriveQualifierSurvivorState,
  getChampionshipManagementSnapshot,
  reopenChampionshipQualifier,
} from "../services/index.js";

export function ChampionsBracketControls({ eventId, placement = "qualifier", onChanged, refreshKey = 0 }) {
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [qualifierState, setQualifierState] = useState(null);

  const load = async () => {
    try {
      const next = await getChampionshipManagementSnapshot();
      setSnapshot(next);
      const current = next.events.find(row => row.id === eventId);
      if (current?.championship_phase === "qualifier") {
        const currentFinal = next.events.find(row => row.id === current.championship_final_event_id);
        const directCount = next.directSelections.filter(row => row.qualifier_event_id === eventId).length;
        setQualifierState(deriveQualifierSurvivorState({
          entries: next.entries.filter(entry => entry.event_id === eventId && entry.entry_type === "individual"),
          matches: next.matches.filter(match => match.event_id === eventId && match.source === "normalized_bracket_runtime" && match.match_kind === "bracket"),
          qualificationSlots: current.qualification_slots,
          finalCapacity: currentFinal?.competition_settings?.championship?.finalCapacity,
          directCount,
        }));
      } else {
        setQualifierState(null);
      }
      setMessage("");
      return next;
    } catch (error) {
      setMessage(error?.message || "Champions 운영 정보를 불러오지 못했습니다.");
      return null;
    }
  };
  useEffect(() => { void load(); }, [eventId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const event = snapshot?.events.find(row => row.id === eventId) || null;
  const playerName = id => snapshot?.players.find(row => row.id === id)?.display_name || "알 수 없는 선수";
  const qualifierEntries = (snapshot?.entries || [])
    .filter(entry => entry.event_id === eventId && entry.entry_type === "individual" && entry.status === "active")
    .map(entry => ({ ...entry, participant: (snapshot?.entryParticipants || []).find(row => row.entry_id === entry.id && row.event_id === eventId) }))
    .filter(entry => entry.participant?.player_id);

  if (!event || placement !== "qualifier" || event.championship_phase !== "qualifier") return null;

  const completeQualifier = async () => {
    setBusy(true); setMessage("");
    try { await completeChampionshipQualifier(event.id); await load(); await onChanged?.(); setMessage("생존 survivor를 본선 진출자로 확정하고 선발전을 종료했습니다.");
    } catch (error) { setMessage(error?.message || "선발전 종료 조건을 확인해 주세요.");
    } finally { setBusy(false); }
  };
  const reopenQualifier = async () => {
    if (!window.confirm("본선에 제출, 대진, 결과가 하나도 없을 때만 선발전 종료를 취소합니다. 계속할까요?")) return;
    setBusy(true); setMessage("");
    try { await reopenChampionshipQualifier(event.id); await load(); await onChanged?.(); setMessage("선발전 종료를 취소했습니다. 기존 경기 결과를 수정할 수 있습니다.");
    } catch (error) { setMessage(error?.message || "선발전 종료 취소 조건을 확인해 주세요.");
    } finally { setBusy(false); }
  };
  const survivorRows=(qualifierState?.aliveEntryIds || []).map(entryId=>qualifierEntries.find(entry=>entry.id===entryId)).filter(Boolean);
  const completed=event.status === "completed";
  const directRows=(snapshot?.directSelections || [])
    .filter(row=>row.qualifier_event_id===eventId)
    .map(row=>({ ...row, registration:(snapshot?.registrations||[]).find(registration=>registration.id===row.qualifier_registration_id) }));
  return <section className="bk-submission" aria-label="본선 진출 현황">
    <div className="records-block-head"><div><h4 style={{margin:0}}>선발전 현황</h4><span>본선 직행 {directRows.length}명, 선발전 생존 {qualifierState?.aliveCount ?? "-"}명 (목표 {qualifierState?.qualifierTarget ?? event.qualification_slots}명)</span></div><button className="btn btn-ghost btn-sm" onClick={()=>void load()} disabled={busy}>새로고침</button></div>
    {message&&<div className="bk-hint" role="alert" style={{color:"var(--loss)",marginTop:8}}>{message}</div>}
    {!qualifierState?.invalid&&!qualifierState?.readyToFinalize&&!completed&&<div className="bk-hint" style={{marginTop:10}}>탈락 {qualifierState?.eliminatedCount ?? "-"} / {qualifierState?.requiredEliminations ?? "-"}명. 앞으로 {qualifierState?.remainingEliminations ?? "-"}명 더 탈락해야 합니다.</div>}
    {qualifierState?.invalid&&<div className="bk-hint" role="alert" style={{color:"var(--loss)",marginTop:10}}>생존자 계산이 유효하지 않습니다. 경기 결과를 확인해 주세요.</div>}
    {(qualifierState?.readyToFinalize||completed)&&<div className="bk-fill" style={{marginTop:10}}><div className="bk-hint">본선 직행 {directRows.length}명, 선발전 생존 {qualifierState?.qualifierTarget ?? event.qualification_slots}명</div>{directRows.map(row=><div className="bk-pin" key={row.id}><span style={{fontWeight:700}}>{playerName(row.player_id)}</span><span className="bk-hint" style={{margin:0}}>직행</span></div>)}{survivorRows.map(entry=><div className="bk-pin" key={entry.id}><span style={{fontWeight:700}}>{entry.display_name || playerName(entry.participant.player_id)}</span><span className="bk-hint" style={{margin:0}}>선발전 통과</span></div>)}</div>}
    <div className="row-actions" style={{justifyContent:"flex-end",marginTop:10}}>{!completed&&qualifierState?.readyToFinalize&&<button className="btn btn-primary btn-sm" disabled={busy} onClick={()=>void completeQualifier()}>선발전 기록 반영</button>}{completed&&<button className="btn btn-ghost btn-sm" disabled={busy} onClick={()=>void reopenQualifier()}>선발전 기록 반영 취소</button>}</div>
  </section>;
}
