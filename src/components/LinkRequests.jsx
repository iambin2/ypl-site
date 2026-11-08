import React, { useEffect, useState } from "react";
import Button from "./common/Button.jsx";
import { SectionHead } from "./common/Board.jsx";
import { siteConfirm } from "./common/SiteDialog.jsx";
import { formatDate } from "../services/dateFormat.js";
import { accountsReady, decideLinkRequest, listLinkRequests } from "../services/visitorAuth.js";

/* 기록 연결 요청 (DESIGN.md "Admin", Google accounts): a Google account asks for a trainer's name; an operator approves or refuses it,
   once each, since it is a decision about someone else (Composing a screen 18). One block wherever it stands: the 운영 page, at its
   top since it is the operators' most frequent decision (2026-11-08, the user), and the records' trainer tab. Each request is a panel
   (the name at 20 with whether a record or an application stands under it, the account, the time), and under it 거절 and 승인 joined
   on the seam, 1 to 1.618. hint: the name's record in one line, where the page knows it. onCount: how many wait, after each read. */
export default function LinkRequests({ hint = null, onCount = null, id = "linkreq-h" }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const load = () => accountsReady().then((ok) => (ok ? listLinkRequests() : [])).then((all) => { setRows(all); onCount?.(all.filter((row) => row.status === "pending").length); }, (error) => setNote(error.message));
  useEffect(() => { load(); }, []);
  const pending = rows.filter((row) => row.status === "pending");
  if (!pending.length && !note) return null;
  const decide = async (row, approve) => {
    const who = row.email || row.account_name || "이 구글 계정";
    const ok = await siteConfirm(approve
      ? { title: "기록 연결 승인", body: `${row.requested_name} 기록을 ${who}에 연결할까요? 연결되면 이 이름의 신청은 이 계정으로만 받습니다.`, confirmLabel: "승인" }
      : { title: "기록 연결 거절", body: `${row.requested_name} 기록 연결 요청을 거절할까요? 요청한 계정은 이름을 다시 정할 수 있습니다.`, confirmLabel: "거절" });
    if (!ok) return;
    setBusy(row.auth_user_id); setNote("");
    try { await decideLinkRequest(row.auth_user_id, approve); await load(); } catch (error) { setNote(error.message); }
    setBusy("");
  };
  return (
    <section className="rc-linkreq" aria-labelledby={id}>
      <SectionHead id={id} title={`기록 연결 요청 ${pending.length}`} />
      <div className="rc-reqs">
        {pending.map((row) => {
          const line = hint?.(row.requested_name);
          return (
            <div className="stack" key={row.auth_user_id}>
              <div className="pn rc-req">
                <div className="rc-req-head">
                  <b className="t20">{row.requested_name}</b>
                  <span className={"rc-place t12" + (row.player_id ? " inv" : " dim rc-req-tag")}>{row.player_id ? "기록 있음" : "이름으로 받은 신청 있음"}</span>
                </div>
                {line && <p className="t12 dim">{line}</p>}
                <p className="t12 dim">{[row.account_name && `구글 ${row.account_name}`, row.email].filter(Boolean).join(", ")}</p>
                <p className="t12 mute">{formatDate(row.requested_at)} 요청</p>
              </div>
              <div className="rc-req-keys">
                <Button variant="second" onClick={() => decide(row, false)} disabled={Boolean(busy)}>거절</Button>
                <Button variant="main" icon="check" onClick={() => decide(row, true)} loading={busy === row.auth_user_id}>승인</Button>
              </div>
            </div>
          );
        })}
      </div>
      {note && <p className="t12 dim rc-req-note">{note}</p>}
    </section>
  );
}
