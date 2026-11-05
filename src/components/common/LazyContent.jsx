import React, { Component, Suspense } from "react";
import Modal from "./Modal.jsx";
import Loader from "./Loader.jsx";
import ErrorNote from "./ErrorNote.jsx";

/* A page opened before a deploy asks for screen files the deploy has deleted (each build renames them). That failure is not
   the visitor's to handle: the page reloads itself once, onto the new build. A second failure within a minute is shown. */
const CHUNK_FAILED = /dynamically imported module|Importing a module script failed/i;
const RELOADED_KEY = "ypl:chunk-reload-at";
function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
  } catch { return false; }
  window.location.reload();
  return true;
}

export default class LazyContent extends Component {
  state = { failed: false, chunk: false };

  // chunk: a deleted screen file, which waits on the loader while the page reloads (no error screen flashes before it)
  static getDerivedStateFromError(error) {
    return { failed: true, chunk: CHUNK_FAILED.test(String(error?.message || error)) };
  }

  componentDidCatch() {
    if (this.state.chunk && !reloadOnce()) this.setState({ chunk: false });
  }

  fallback(failed = false) {
    // L4: 차분한 문장과 다시 시도 버튼. L1: 공용 로더.
    const content = failed ? (
      <ErrorNote action="새로고침" onRetry={() => window.location.reload()}>화면을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.</ErrorNote>
    ) : (
      <Loader small={!!this.props.onClose} />
    );
    return this.props.onClose
      ? (failed ? <Modal title="불러오지 못했습니다." onClose={this.props.onClose}>{content}</Modal> : <Modal label="불러오는 중" onClose={this.props.onClose}>{content}</Modal>)
      : <section className="sec">{content}</section>;
  }

  render() {
    if (this.state.failed) return this.fallback(!this.state.chunk);
    return <Suspense fallback={this.fallback()}>{this.props.children}</Suspense>;
  }
}
