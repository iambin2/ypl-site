import React, { Component, Suspense } from "react";
import Modal from "./Modal.jsx";

// A failed deployment chunk can recover through a document reload, which also
// runs the existing version check. Keep the shell and modal close action usable.
export default class LazyContent extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  fallback(failed = false) {
    const content = failed ? (
      <div role="alert">
        <p>화면을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>새로고침</button>
      </div>
    ) : <p className="loading-txt" role="status" aria-live="polite">불러오는 중</p>;
    return this.props.onClose
      ? <Modal title={failed ? "불러오기 실패" : "불러오는 중"} onClose={this.props.onClose}>{content}</Modal>
      : <section className="sec">{content}</section>;
  }

  render() {
    if (this.state.failed) return this.fallback(true);
    return <Suspense fallback={this.fallback()}>{this.props.children}</Suspense>;
  }
}
