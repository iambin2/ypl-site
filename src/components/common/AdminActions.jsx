import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal.jsx";
import "./shared-ui.css";

/* 관리자 삭제 등 되돌릴 수 없는 동작을 위한 공통 장치.
   - confirmAction : 사이트 디자인의 확인 대화상자 (브라우저 기본 confirm 대체)
   - promptAction  : 값 입력이 필요한 확인 대화상자 (기본 prompt 대체)
   - alertAction   : 알림 대화상자 (기본 alert 대체)
   - deleteWithUndo: 삭제 직후 10초 동안 되돌릴 수 있는 안내 바 표시 */

const UNDO_MS = 10000;
const TICK_MS = 100;

const AdminActionsContext = createContext(null);

export function useAdminActions() {
  const value = useContext(AdminActionsContext);
  if (!value) throw new Error("AdminActionsProvider 안에서만 사용할 수 있습니다.");
  return value;
}

function ConfirmDialog({ request, onResolve }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);
  const isPrompt = request.kind === "prompt";
  const isAlert = request.kind === "alert";

  useEffect(() => {
    setValue("");
    if (isPrompt) window.requestAnimationFrame(() => inputRef.current && inputRef.current.focus());
  }, [request, isPrompt]);

  const submit = () => {
    if (isPrompt) onResolve(value.trim());
    else onResolve(true);
  };

  return (
    <Modal title={request.title} hint={request.message} onClose={() => onResolve(isPrompt ? null : false)}>
      {isPrompt && (
        <div className="field confirm-field">
          {request.label && <label>{request.label}</label>}
          <input
            ref={inputRef}
            value={value}
            inputMode={request.numeric ? "numeric" : undefined}
            maxLength={request.maxLength}
            placeholder={request.placeholder || ""}
            onChange={(e) => setValue(request.numeric ? e.target.value.replace(/\D/g, "") : e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
        </div>
      )}
      <div className="modal-actions confirm-actions">
        {!isAlert && (
          <button className="btn btn-ghost" onClick={() => onResolve(isPrompt ? null : false)}>
            {request.cancelLabel || "취소"}
          </button>
        )}
        <button className={"btn " + (request.danger ? "btn-danger" : "btn-primary")} onClick={submit}>
          {request.confirmLabel || (isAlert ? "확인" : "삭제")}
        </button>
      </div>
    </Modal>
  );
}

function UndoBar({ undo, onUndo, onDismiss }) {
  const [left, setLeft] = useState(UNDO_MS);

  useEffect(() => {
    setLeft(UNDO_MS);
    const started = Date.now();
    const timer = setInterval(() => {
      const remain = UNDO_MS - (Date.now() - started);
      if (remain <= 0) { clearInterval(timer); onDismiss(); }
      else setLeft(remain);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [undo, onDismiss]);

  const seconds = Math.max(1, Math.ceil(left / 1000));
  const ratio = Math.max(0, Math.min(1, left / UNDO_MS));

  return (
    <div className="undo-bar" role="status">
      <div className="undo-bar-in">
        <span className="undo-bar-text">{undo.label}</span>
        <span className="undo-bar-count tnum">{seconds}초</span>
        <button className="undo-bar-btn" onClick={onUndo}>되돌리기</button>
      </div>
      <div className="undo-bar-track"><div className="undo-bar-fill" style={{ transform: `scaleX(${ratio})` }} /></div>
    </div>
  );
}

export function AdminActionsProvider({ data, save, flash, children }) {
  const [request, setRequest] = useState(null);
  const [undo, setUndo] = useState(null);
  const resolver = useRef(null);

  const ask = useCallback((kind, options) => new Promise((resolve) => {
    resolver.current = resolve;
    setRequest({ kind, ...options });
  }), []);

  const resolve = useCallback((result) => {
    setRequest(null);
    const fn = resolver.current;
    resolver.current = null;
    if (fn) fn(result);
  }, []);

  const confirmAction = useCallback((options) => ask("confirm", options), [ask]);
  const promptAction = useCallback((options) => ask("prompt", options), [ask]);
  const alertAction = useCallback((options) => ask("alert", options), [ask]);

  const dismissUndo = useCallback(() => setUndo(null), []);

  /* 임의의 동작에 10초 되돌리기를 붙인다. */
  const undoable = useCallback(({ label, onUndo }) => {
    setUndo({ label: label || "삭제했습니다", onUndo, at: Date.now() });
  }, []);

  /* 공용 데이터 삭제를 반영하고, 10초 동안 직전 상태로 되돌릴 수 있게 한다. */
  const deleteWithUndo = useCallback(({ label, next }) => {
    const snapshot = data;
    save(next, { silent: true });
    undoable({ label, onUndo: () => save(snapshot, { silent: true }) });
  }, [data, save, undoable]);

  const runUndo = useCallback(() => {
    if (!undo) return;
    undo.onUndo && undo.onUndo();
    setUndo(null);
    flash && flash("되돌렸습니다");
  }, [undo, flash]);

  const value = useMemo(
    () => ({ confirmAction, promptAction, alertAction, deleteWithUndo, undoable }),
    [confirmAction, promptAction, alertAction, deleteWithUndo, undoable]
  );

  return (
    <AdminActionsContext.Provider value={value}>
      {children}
      {request && <ConfirmDialog request={request} onResolve={resolve} />}
      {undo && <UndoBar undo={undo} onUndo={runUndo} onDismiss={dismissUndo} />}
    </AdminActionsContext.Provider>
  );
}
