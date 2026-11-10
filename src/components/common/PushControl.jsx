import React, { useEffect, useState } from "react";
import { currentPushMode, disablePush, enablePush, isPushOn } from "../../services/announcementPush.js";
import Button from "./Button.jsx";
import Icon from "./Icon.jsx";
import Modal from "./Modal.jsx";
import { siteAlert } from "./SiteDialog.jsx";

/* 새 공지 알림: 켜기 전에 이유를 먼저 말하는 시트를 띄우고, 끄기는 바로 한다.
   공지 화면은 12px 단어(PushLink)로, 더보기는 스위치 줄(PushSwitch)로 같은 상태를 쓴다. */
function usePush() {
  const [mode] = useState(currentPushMode);
  const [on, setOn] = useState(false); const [busy, setBusy] = useState(mode === "ready"); const [ask, setAsk] = useState(false);
  const [fail, setFail] = useState("");
  useEffect(() => {
    if (mode !== "ready") return undefined;
    let cancelled = false;
    isPushOn().then(value => { if (!cancelled) setOn(value); }).catch(console.error).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [mode]);
  /* a failure while the sheet stands is said in the sheet, in the key's place: a sheet never opens a dialog over itself
     (DESIGN.md "Sheets"; 2026-11-10: 알림 설정을 바꾸지 못했습니다 rose over the sheet that had asked) */
  const flip = async () => {
    setBusy(true); setFail("");
    try { if (on) await disablePush(); else await enablePush(); setOn(!on); setAsk(false); }
    catch (error) { const why = error?.message || "잠시 뒤 다시 시도해 주세요."; if (ask) setFail(why); else siteAlert("알림 설정을 바꾸지 못했습니다.", why); }
    finally { setBusy(false); }
  };
  const press = () => {
    if (mode === "unsupported") return siteAlert("이 브라우저에서는 알림을 켤 수 없습니다.", "카카오톡이나 디스코드 안에서 열었다면 최신 Chrome이나 Safari에서 다시 열어 주세요.");
    if (on) return flip();
    setFail(""); setAsk(true);
  };
  // notifications already refused in the browser: the key could only fail, so the sheet says what to do instead of offering it
  const blocked = mode === "ready" && typeof Notification !== "undefined" && Notification.permission === "denied";
  const say = mode === "install" ? "아이폰과 아이패드는 Safari의 공유 버튼에서 홈 화면에 추가한 뒤, 그 앱의 공지 화면에서 알림을 켤 수 있습니다."
    : blocked ? "브라우저 설정에서 이 사이트의 알림을 허용해 주세요." : fail;
  const sheet = ask && <Modal title="새 공지를 알림으로 받습니다." onClose={() => setAsk(false)}>
    <div className="push-ask">
      {say && <p className="pn2 push-note t12 reg dim" role={mode === "install" ? undefined : "alert"}><Icon n="info" size={20} /><span>{say}</span></p>}
      {mode === "ready" && !blocked && <Button variant="main" icon="bell" disabled={busy} onClick={flip}>알림 받기</Button>}
      <Button variant="link" className="push-later" onClick={() => setAsk(false)}>나중에</Button>
    </div>
  </Modal>;
  return { mode, on, busy, press, sheet };
}

export function PushLink() {
  const { mode, on, busy, press, sheet } = usePush();
  if (mode === "none") return null;
  return <><button type="button" className="push-link t12" disabled={busy} onClick={press}><Icon n="bell" size={16} />{on ? "알림 끄기" : "알림 받기"}</button>{sheet}</>;
}

/* a switch row: 52 by 32, off a muted square in panel-2, on inverted with the square at the right */
export function PushSwitch() {
  const { mode, on, busy, press, sheet } = usePush();
  if (mode === "none") return null;
  return <>
    <button type="button" className="pn row switch-row" role="switch" aria-checked={on} disabled={busy} onClick={press}>
      <span className="row-main"><b className="t15">공지 알림</b></span>
      <span className={"sw" + (on ? " on" : "")} aria-hidden="true"><i /></span>
    </button>
    {sheet}
  </>;
}
