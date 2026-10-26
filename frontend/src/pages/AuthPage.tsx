import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import "./AuthPage.css";

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (user) return <Navigate to="/app" replace />;
  const isRegister = mode === "register";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (isRegister && password !== confirm) { setError("Mật khẩu xác nhận chưa khớp."); return; }
    setBusy(true);
    try {
      if (isRegister) {
        await register(email.trim(), password);
        navigate("/login?registered=1", { replace: true });
      } else {
        await login(email.trim(), password);
        navigate("/app", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể đăng nhập.");
    } finally { setBusy(false); }
  }
  return <main className="auth-wrap">
    <section className="auth-card">
      <p className="auth-label">✦ EDUMIND AI</p>
      <h1>{isRegister ? "Tạo tài khoản học viên" : "Đăng nhập"}</h1>
      <p className="auth-sub">Tài liệu, bài thi và kết quả được lưu theo tài khoản.</p>
      {!isRegister && params.get("registered") === "1" && <p role="status" className="auth-hint">Đăng ký thành công! Bạn có thể đăng nhập ngay bằng email và mật khẩu.</p>}
      <form onSubmit={submit}>
        <label htmlFor="login-email">Email</label>
        <input id="login-email" type="email" required autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)} maxLength={254} />
        <label htmlFor="login-password">Mật khẩu</label>
        <input id="login-password" type="password" required minLength={isRegister ? 10 : 1}
          autoComplete={isRegister ? "new-password" : "current-password"}
          value={password} onChange={(e) => setPassword(e.target.value)} />
        {isRegister && <>
          <p className="auth-hint">Ít nhất 10 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.</p>
          <label htmlFor="login-confirm">Nhập lại mật khẩu</label>
          <input id="login-confirm" type="password" required autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Đang xử lý…" : isRegister ? "Đăng ký" : "Đăng nhập"}</button>
      </form>
      <p className="auth-switch">{isRegister ? "Đã có tài khoản? " : "Chưa có tài khoản? "}
        <Link to={isRegister ? "/login" : "/register"}>{isRegister ? "Đăng nhập" : "Đăng ký"}</Link>
      </p>
      {!isRegister && <p className="auth-switch"><Link to="/forgot-password">Quên mật khẩu?</Link></p>}
    </section>
  </main>;
}
