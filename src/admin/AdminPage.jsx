import React, { useEffect, useState } from "react";
import Button from "../components/common/Button.jsx";
import Empty from "../components/common/Empty.jsx";
import Loader from "../components/common/Loader.jsx";
import { Counter, Row, SectionHead, Steps } from "../components/common/Board.jsx";
import LinkRequests from "../components/LinkRequests.jsx";
import { formatDate } from "../services/dateFormat.js";
import { ADMIN_STEPS, adminTasks, readAdminOverview } from "../services/adminOverview.js";

/* 운영 (DESIGN.md "Admin", 2026-11-08): the operators' one place. Their work had stood scattered inside the public pages (a notice's
   responses, a bracket's result entry and record, the trainer tab's link requests), found only by going to each. Here: four counters,
   what waits as rows in the order things happen now, each going to the screen that does it; beside them (the 439 on desktop, held in
   view) each event in progress with its four steps and the one action its step asks for; under the rows, the doors to every editor. */
const DOORS = [
  ["공지 쓰기", "news", "대회 공지와 신청서"],
  ["대진표", "bracket", "새 대진표, 결과 입력, 기록 반영"],
  ["기록", "records", "트레이너, 대회, 랭킹", { tab: "trainer" }],
  ["칭호", "titles", "칭호와 보유자"],
  ["명예의 전당", "champions", "역대 챔피언"],
  ["게시판", "board", "글과 댓글 정리"],
];
const STEP_ACTION = { 1: null, 2: "대진표 만들기", 3: "결과 입력", 4: "기록에 반영" };
const when = e => (e.heldOn ? formatDate(e.startTime ? `${String(e.heldOn).slice(0, 10)}T${e.startTime}` : e.heldOn, { time: Boolean(e.startTime) }) : "");

// now in Korea as the notice editor writes its times ("2026-11-08T21:05"): the server reads closesAt as Korean time
const koreaNow = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16).replace(" ", "T");

function EventPanel({ e, main, go, onClose }) {
  const facts = [
    e.step === 1 && e.closesAt && ["신청 마감", `${formatDate(e.closesAt, { time: true })}까지`],
    e.applicants != null && ["신청", `${e.applicants}명`],
    e.entrants ? ["파티 제출", `${e.submitted} / ${e.entrants}${e.late ? `, 마감 뒤 ${e.late}번` : ""}`] : null,
    e.total ? ["경기", `${e.stage} ${e.done} / ${e.total} 종료`] : null,
    e.battles ? ["배틀", `${e.battles}개 진행 중`] : null,
  ].filter(Boolean);
  const action = STEP_ACTION[e.step];
  return <section className="ad-event" aria-label={e.name}>
    <div className="pn ad-event-head">
      <b className="t20">{e.name}</b>
      <span className="t12 dim">{[when(e), e.awaiting ? "기록 반영 전" : ""].filter(Boolean).join(", ")}</span>
    </div>
    <Steps labels={ADMIN_STEPS} at={e.step} />
    {facts.length > 0 && <div className="stack">{facts.map(([k, v]) => <div className="pn spec-row" key={k}><span className="t12 dim">{k}</span><span className="t15">{v}</span></div>)}</div>}
    {action ? <Button variant={main ? "main" : "second"} icon={e.step === 4 ? "check" : "arrow"} onClick={() => go("bracket", { eventId: e.id })}>{action}</Button>
      /* while it takes applications: close them now (undone from the toast), and the applications themselves */
      : e.noticeId && <div className="stack ad-keys">
        {e.closesAt && <Button variant="second" onClick={() => onClose(e)}>지금 마감</Button>}
        <Button variant="second" onClick={() => go("news", { notice: e.noticeId })}>신청 현황</Button>
      </div>}
  </section>;
}

export default function AdminPage({ data, admin, go, onAdmin, save, flash, onRequests }) {
  const [overview, setOverview] = useState(null);
  const [pending, setPending] = useState(null);
  const counted = n => { setPending(n); onRequests?.(n); };
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!admin) return undefined;
    let on = true;
    readAdminOverview(data.announcements).then(o => on && setOverview(o), () => on && setFailed(true));
    return () => { on = false; };
  }, [admin, data.announcements]);
  /* 지금 마감: the notice's closing time becomes now, so the form shuts and the server refuses new applications
     (docs/db/application_close.sql). It can be undone, so it acts at once and the toast offers 되돌리기 (Composing a screen 18). */
  const closeNow = async e => {
    const withClose = at => ({ ...data, announcements: data.announcements.map(a => (a.id === e.noticeId ? { ...a, form: { ...a.form, closesAt: at } } : a)) });
    const before = e.closesAt;
    if (await save(withClose(koreaNow()), "신청을 마감했습니다.")) flash("신청을 마감했습니다.", { label: "되돌리기", run: () => save(withClose(before), "마감을 되돌렸습니다.") });
  };
  if (!admin) return <div className="ad-page"><h1 className="t32">운영</h1><Empty title="관리자 로그인이 필요합니다." desc="운영진 계정으로 로그인하면 할 일이 여기에 모입니다." />
    <Button variant="main" onClick={onAdmin}>관리자 로그인</Button></div>;
  const tasks = adminTasks(overview);
  // the requests block reads them itself and says how many wait after each decision; until it does, the overview's count stands
  const requests = pending ?? overview?.requests?.length ?? null;
  const events = overview?.events || [];
  const n = v => (overview ? String(v) : null);
  const open = (t) => {
    go("bracket", { eventId: t.event.id });
  };
  return <div className="ad-page">
    <h1 className="t32">운영</h1>
    <div className="stack ad-counts">
      <Counter label="할 일" value={n(tasks.length)} lamp={tasks.length > 0} />
      <Counter label="신청" value={n(events.filter(e => e.step === 1).reduce((s, e) => s + (e.applicants || 0), 0))} cells={3} />
      <Counter label="남은 경기" value={n(events.reduce((s, e) => s + e.left, 0))} />
      <Counter label="연결 요청" value={requests == null ? null : String(requests)} lamp={requests > 0} />
    </div>
    {/* the decision operators make most: Google accounts asking for a trainer's record, first and across the page */}
    <LinkRequests id="ad-linkreq-h" onCount={counted} />
    {failed ? <Empty title="운영 현황을 불러오지 못했습니다." desc="잠시 뒤 다시 열어 주세요." />
      : !overview ? <Loader />
      : <div className="ad-cols">
        <div className="ad-main">
          <section className="ad-block" aria-labelledby="ad-todo-h">
            <SectionHead id="ad-todo-h" title="할 일" />
            {tasks.length ? <div className="stack">{tasks.map(t => <Row key={t.key} title={t.title} line={t.line} lamp={true} onClick={() => open(t)} label={`${t.title}, ${t.line}`} />)}</div>
              : <div className="pn ad-none"><span className="t15">지금 할 일이 없습니다.</span><span className="t12 dim">결과 입력, 대진표, 기록 반영이 생기면 여기에 섭니다.</span></div>}
          </section>
          <section className="ad-block" aria-labelledby="ad-doors-h">
            <SectionHead id="ad-doors-h" title="편집" />
            <div className="stack ad-doors">{DOORS.map(([title, view, line, options]) => <Row key={view} title={title} line={line} onClick={() => go(view, options)} />)}</div>
          </section>
        </div>
        <aside className="ad-side" aria-labelledby="ad-events-h">
          <SectionHead id="ad-events-h" title="대회 진행" />
          {events.length ? events.map((e, i) => <EventPanel key={e.id} e={e} main={i === 0} go={go} onClose={closeNow} />)
            : <div className="pn ad-none"><span className="t15">진행 중인 대회가 없습니다.</span><span className="t12 dim">대회 공지에서 신청을 열면 여기에 섭니다.</span></div>}
        </aside>
      </div>}
  </div>;
}
