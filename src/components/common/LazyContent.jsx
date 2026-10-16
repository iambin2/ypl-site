import React, { Component, Suspense } from "react";
import Modal from "./Modal.jsx";
import Loader from "./Loader.jsx";

// A failed deployment chunk can recover through a document reload, which also
// runs the existing version check. Keep the shell and modal close action usable.
export default class LazyContent extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  fallback(failed = false) {
    // L4: 차분한 문장과 다시 시도 버튼. L1: 공용 로더.
    const content = failed ? (
      <div className="ypl-error" role="alert">
        <p className="callout">화면을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>새로고침</button>
      </div>
    ) : (
      <Loader small={!!this.props.onClose} />
    );
    return this.props.onClose
      ? (failed ? <Modal title="불러오기 실패" onClose={this.props.onClose}>{content}</Modal> : <Modal label="불러오는 중" onClose={this.props.onClose}>{content}</Modal>)
      : <section className="sec">{content}</section>;
  }

  render() {
    if (this.state.failed) return this.fallback(true);
    return <Suspense fallback={this.fallback()}>{this.props.children}</Suspense>;
  }
}
