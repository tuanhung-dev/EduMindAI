import { useEffect, useState } from "react";

type Toast = { id: number; status: number; message: string };
type ApiFeedback = { status?: number; message?: string };

/** Toast toan he thong: thong bao loi ket noi, quyen truy cap va server. */
export default function ApiToastHost() {
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    let lastMessage = "";
    let lastAt = 0;
    const onFeedback = (event: Event) => {
      const payload = (event as CustomEvent<ApiFeedback>).detail;
      if (!payload || typeof payload.message !== "string") return;
      const now = Date.now();
      // Trang co the polling: chi hien lai thong bao trung nhau sau 10 giay.
      if (payload.message === lastMessage && now - lastAt < 10000) return;
      lastMessage = payload.message; lastAt = now;
      setToast({ id: now, status: payload.status ?? 0, message: payload.message });
    };
    const onExpired = () => setToast({ id: Date.now(), status: 401, message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." });
    window.addEventListener("edumind-api-feedback", onFeedback);
    window.addEventListener("edumind-auth-expired", onExpired);
    return () => {
      window.removeEventListener("edumind-api-feedback", onFeedback);
      window.removeEventListener("edumind-auth-expired", onExpired);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(current => current?.id === toast.id ? null : current), 6500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return <div className="ed-feedback-toasts" role="status" aria-live="polite">
    <div className="ed-feedback-toast">
      <span className="ed-feedback-icon" aria-hidden="true">!</span>
      <div><strong>{toast.status === 401 ? "Phiên đăng nhập" : toast.status === 403 ? "Quyền truy cập" : toast.status === 429 ? "Giới hạn yêu cầu" : "Kết nối hệ thống"}</strong><p>{toast.message}</p></div>
      <button type="button" onClick={() => setToast(null)} aria-label="Đóng thông báo">×</button>
    </div>
  </div>;
}
