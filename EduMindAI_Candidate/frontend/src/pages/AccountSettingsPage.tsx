import { useState, type FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import { changePassword } from "../services/accountSecurityService";
import "./AuthPage.css";

export default function AccountSettingsPage() {
  const { user, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (next !== confirm) { setError("Hai mật khẩu mới chưa khớp."); return; }
    if (current === next) { setError("Mật khẩu mới phải khác mật khẩu hiện tại."); return; }
    setBusy(true);
    try {
      await changePassword(current, next);
      logout(); // Clear local bearer token; user must sign in again.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đổi mật khẩu không thành công.");
    } finally { setBusy(false); }
  }

  return <div style={{ maxWidth: 560, margin: "0 auto" }}>
    <h1>Tài khoản của tôi</h1>
    <p>Email: <strong>{user?.email}</strong> · Vai trò: {user?.role === "Admin" ? "Quản trị viên" : "Học viên"}</p>
    <section className="auth-card" style={{ marginTop: 20 }}>
      <h2>Đổi mật khẩu</h2>
      <p className="auth-sub">Sau khi đổi mật khẩu, hệ thống yêu cầu đăng nhập lại.</p>
      <form onSubmit={submit}>
        <label htmlFor="old-password">Mật khẩu hiện tại</label>
        <input id="old-password" type="password" autoComplete="current-password" required
          value={current} onChange={event => setCurrent(event.target.value)} />
        <label htmlFor="new-password">Mật khẩu mới</label>
        <input id="new-password" type="password" autoComplete="new-password" required minLength={10}
          value={next} onChange={event => setNext(event.target.value)} />
        <label htmlFor="repeat-password">Nhập lại mật khẩu mới</label>
        <input id="repeat-password" type="password" autoComplete="new-password" required minLength={10}
          value={confirm} onChange={event => setConfirm(event.target.value)} />
        <p className="auth-hint">Ít nhất 10 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt.</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Đang cập nhật…" : "Đổi mật khẩu"}</button>
      </form>
    </section>
  </div>;
}
