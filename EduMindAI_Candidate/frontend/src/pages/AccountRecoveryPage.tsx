import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmEmail, requestPasswordReset, resendConfirmation, resetPassword } from "../services/accountSecurityService";
import "./AuthPage.css";

type RecoveryMode = "confirm" | "forgot" | "reset" | "resend";

const titles: Record<RecoveryMode, string> = {
  confirm: "Xác minh địa chỉ email", forgot: "Quên mật khẩu", reset: "Đặt lại mật khẩu", resend: "Gửi lại email xác minh",
};

export default function AccountRecoveryPage({ mode }: { mode: RecoveryMode }) {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const code = params.get("code") || "";
  const userId = params.get("userId") || "";
  const invalidLink = (mode === "confirm" && (!code || !userId)) || (mode === "reset" && !code);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(""); setError("");
    if (mode === "reset" && password !== confirm) {
      setError("Mật khẩu nhập lại không khớp."); return;
    }
    setBusy(true);
    try {
      const result = mode === "confirm" ? await confirmEmail(userId, code)
        : mode === "forgot" ? await requestPasswordReset(email.trim())
          : mode === "resend" ? await resendConfirmation(email.trim())
            : await resetPassword(email.trim(), code, password);
      setMessage(result);
      setPassword(""); setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể thực hiện yêu cầu.");
    } finally { setBusy(false); }
  }

  return <main className="auth-wrap"><section className="auth-card">
    <p className="auth-label">✦ EDUMIND AI</p>
    <h1>{titles[mode]}</h1>
    <p className="auth-sub">Liên kết xác minh và đặt lại mật khẩu được gửi tới email đã đăng ký.</p>
    {invalidLink ? <p role="alert" className="auth-error">Liên kết không có đủ thông tin. Hãy kiểm tra email hoặc yêu cầu gửi lại.</p> :
      <form onSubmit={submit}>
        {mode !== "confirm" && <>
          <label htmlFor="recover-email">Email</label>
          <input id="recover-email" type="email" autoComplete="email" required value={email}
            onChange={event => setEmail(event.target.value)} maxLength={254} />
        </>}
        {mode === "reset" && <>
          <label htmlFor="recover-pass">Mật khẩu mới</label>
          <input id="recover-pass" type="password" autoComplete="new-password" required minLength={10}
            value={password} onChange={event => setPassword(event.target.value)} />
          <label htmlFor="recover-confirm">Nhập lại mật khẩu mới</label>
          <input id="recover-confirm" type="password" autoComplete="new-password" required minLength={10}
            value={confirm} onChange={event => setConfirm(event.target.value)} />
        </>}
        {message && <p role="status" className="auth-hint">{message}</p>}
        {error && <p role="alert" className="auth-error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? "Đang xử lý…" : mode === "confirm" ? "Xác minh email" : mode === "reset" ? "Lưu mật khẩu mới" : "Gửi yêu cầu"}</button>
      </form>}
    <p className="auth-switch"><Link to="/login">Quay lại đăng nhập</Link></p>
  </section></main>;
}
