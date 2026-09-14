import React, { useEffect, useState } from "react";
import Modal from "./Modal.jsx";

/* 사이트 대화상자 — 브라우저 기본 alert / confirm / prompt 를 대신한다.
   기본 팝업은 운영체제 모양이라 사이트의 대화상자, 시트, 모션과 어긋난다.
   호출 방식은 기본 팝업과 같게 유지하되 Promise 로 결과를 돌려준다. */
let pushRequest = null;
const pending = [];
let nextId = 1;

function request(kind, options) {
  return new Promise(resolve => {
    const item = { id: nextId++, kind, ...options, resolve };
    if (pushRequest) pushRequest(item); else pending.push(item);
  });
}

/** 알림. 닫히면 resolve 된다. */
export const siteAlert = (title, body = "") => request("alert", { title, body });
/** 확인. 확인이면 true, 취소나 닫기면 false. */
export const siteConfirm = ({ title, body = "", confirmLabel = "확인", danger = false }) =>
  request("confirm", { title, body, confirmLabel, danger });
/** 입력. 입력값(앞뒤 공백 제거) 또는 취소 시 null. */
export const sitePrompt = ({ title, body = "", label = "", placeholder = "", confirmLabel = "확인", secret = false, inputMode }) =>
  request("prompt", { title, body, label, placeholder, confirmLabel, secret, inputMode });

export function SiteDialogHost() {
  const [queue, setQueue] = useState([]);
  const [value, setValue] = useState("");
  useEffect(() => {
    pushRequest = item => setQueue(current => [...current, item]);
    pending.splice(0).forEach(pushRequest);
    return () => { pushRequest = null; };
  }, []);

  const current = queue[0];
  if (!current) return null;

  const finish = result => {
    current.resolve(result);
    setValue("");
    setQueue(rest => rest.slice(1));
  };
  const cancel = () => finish(current.kind === "confirm" ? false : current.kind === "prompt" ? null : undefined);
  const accept = () => finish(current.kind === "confirm" ? true : current.kind === "prompt" ? value.trim() : undefined);

  return (
    <Modal key={current.id} title={current.title} hint={current.body || undefined} onClose={cancel}>
      {current.kind === "prompt" && <div className="field">
        {current.label && <label htmlFor={`site-dialog-${current.id}`}>{current.label}</label>}
        <input
          id={`site-dialog-${current.id}`}
          type={current.secret ? "password" : "text"}
          inputMode={current.inputMode}
          value={value}
          placeholder={current.placeholder}
          autoFocus
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); accept(); } }}
        />
      </div>}
      <div className="modal-actions">
        {current.kind !== "alert" && <button type="button" className="btn btn-ghost" onClick={cancel}>취소</button>}
        <button
          type="button"
          className={current.danger ? "btn btn-danger" : "btn btn-primary"}
          onClick={accept}
          autoFocus={current.kind !== "prompt"}
        >
          {current.kind === "alert" ? "확인" : current.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
