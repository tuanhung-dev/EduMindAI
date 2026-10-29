import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

// Chặn lỗi render ở một trang học tập để tránh toàn bộ giao diện trắng.
// KHÔNG thay thế xử lý lỗi HTTP/API bên trong từng trang.
export default class PageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Thông tin chi tiết chỉ ở DevTools, không lộ stack trace trên giao diện học viên.
    console.error("EduMind AI: lỗi hiển thị trang", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section className="ux29-page-error" role="alert" aria-live="assertive">
        <span className="ux29-error-icon" aria-hidden="true">!</span>
        <h1>Trang này tạm thời gặp sự cố</h1>
        <p>EduMind AI không thể hiển thị nội dung hiện tại. Bạn có thể tải lại trang hoặc quay về Tổng quan.</p>
        <div className="ux29-error-actions">
          <button type="button" onClick={() => window.location.reload()}>Tải lại trang</button>
          <a href="/app">Về Tổng quan</a>
        </div>
      </section>
    );
  }
}
