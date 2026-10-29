import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AuthShell from "../components/AuthShell";
import { isStrongPassword, isValidEmail, passwordRules } from "../utils/authValidation";
import { confirmEmail, requestPasswordReset, resendConfirmation, resetPassword } from "../services/accountSecurityService";

type RecoveryMode = "confirm" | "forgot" | "reset" | "resend";

const info: Record<RecoveryMode, { eyebrow: string; title: string; subtitle: string; action: string }> = {
  confirm: { eyebrow: "XÁC MINH TÀI KHOẢN", title: "Xác minh email", subtitle: "Xác nhận địa chỉ email của bạn để tiếp tục sử dụng tài khoản.", action: "Xác minh email" },
  forgot: { eyebrow: "KHÔI PHỤC TÀI KHOẢN", title: "Quên mật khẩu?", subtitle: "Nhập email đã đăng ký. Nếu tài khoản đủ điều kiện, hướng dẫn đặt lại mật khẩu sẽ được gửi đến bạn.", action: "Gửi hướng dẫn" },
  reset: { eyebrow: "BẢO MẬT TÀI KHOẢN", title: "Đặt lại mật khẩu", subtitle: "Tạo mật khẩu mới đủ mạnh để bảo vệ tài khoản EduMind AI của bạn.", action: "Lưu mật khẩu mới" },
  resend: { eyebrow: "XÁC MINH TÀI KHOẢN", title: "Gửi lại email xác minh", subtitle: "Nhập email tài khoản để yêu cầu gửi lại hướng dẫn xác minh.", action: "Gửi lại email" },
};

export default function AccountRecoveryPage({ mode }: { mode: RecoveryMode }) {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const code = params.get("code") || "";
  const userId = params.get("userId") || "";
  const invalidLink = (mode === "confirm" && (!code || !userId)) || (mode === "reset" && !code);
  const emailError = submitted && mode !== "confirm" && !isValidEmail(email);
  const passwordError = submitted && mode === "reset" && !isStrongPassword(password);
  const confirmError = submitted && mode === "reset" && (confirm.length === 0 || confirm !== password);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || invalidLink || message) return;
    setSubmitted(true);
    setError("");
    if ((mode !== "confirm" && !isValidEmail(email)) ||
      (mode === "reset" && (!isStrongPassword(password) || confirm !== password))) return;
    setBusy(true);
    try {
      const result = mode === "confirm" ? await confirmEmail(userId, code)
        : mode === "forgot" ? await requestPasswordReset(email.trim())
          : mode === "resend" ? await resendConfirmation(email.trim())
            : await resetPassword(email.trim(), code, password);
      setMessage(result);
      setPassword(""); setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể thực hiện yêu cầu. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return <AuthShell eyebrow={info[mode].eyebrow} title={info[mode].title} subtitle={info[mode].subtitle}>
    {invalidLink ? <div role="alert" className="em-auth-alert em-auth-alert--error">Liên kết không có đủ thông tin. Hãy kiểm tra email hoặc yêu cầu gửi lại liên kết.</div> :
      <form className="em-auth-form" onSubmit={submit} noValidate aria-busy={busy}>
        {mode !== "confirm" && <div className="em-auth-field">
          <label htmlFor="recover-email">Địa chỉ email</label>
          <div className={`em-auth-control ${emailError ? "has-error" : ""}`}>
            <span className="em-auth-control__icon" aria-hidden="true">@</span>
            <input id="recover-email" name="email" type="email" autoComplete="email" inputMode="email" spellCheck={false}
              placeholder="tenban@example.com" required maxLength={254} value={email} disabled={busy || !!message}
              onChange={e => { setEmail(e.target.value); setError(""); }} aria-invalid={emailError}
              aria-describedby={emailError ? "recover-email-error" : undefined}/>
          </div>
          {emailError && <p id="recover-email-error" className="em-auth-field-error">Vui lòng nhập địa chỉ email hợp lệ.</p>}
        </div>}
        {mode === "reset" && <>
          <div className="em-auth-field">
            <label htmlFor="recover-pass">Mật khẩu mới</label>
            <div className={`em-auth-control ${passwordError ? "has-error" : ""}`}>
              <span className="em-auth-control__icon" aria-hidden="true">✳</span>
              <input id="recover-pass" type={visible ? "text" : "password"} autoComplete="new-password" required minLength={10}
                placeholder="Tạo mật khẩu mới" value={password} disabled={busy || !!message}
                onChange={e => setPassword(e.target.value)} aria-invalid={passwordError}
                aria-describedby="recover-pass-rules" />
              <button type="button" className="em-auth-visibility" onClick={() => setVisible(v => !v)} disabled={busy || !!message}
                aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={visible}>{visible ? "Ẩn" : "Hiện"}</button>
            </div>
            {passwordError && <p className="em-auth-field-error">Mật khẩu chưa đáp ứng đủ các điều kiện.</p>}
            <div className="em-auth-requirements" id="recover-pass-rules">
              {passwordRules.map(rule => <span className={rule.test(password) ? "is-valid" : ""} key={rule.label}><span aria-hidden="true">{rule.test(password) ? "✓" : "○"}</span>{rule.label}</span>)}
            </div>
          </div>
          <div className="em-auth-field">
            <label htmlFor="recover-confirm">Nhập lại mật khẩu mới</label>
            <div className={`em-auth-control ${confirmError ? "has-error" : ""}`}>
              <span className="em-auth-control__icon" aria-hidden="true">✳</span>
              <input id="recover-confirm" type={visible ? "text" : "password"} autoComplete="new-password" required minLength={10}
                placeholder="Xác nhận mật khẩu mới" value={confirm} disabled={busy || !!message}
                onChange={e => setConfirm(e.target.value)} aria-invalid={confirmError}/>
            </div>
            {confirmError && <p className="em-auth-field-error">Mật khẩu xác nhận không khớp.</p>}
          </div>
        </>}
        {message && <div role="status" className="em-auth-alert em-auth-alert--success">✓ {message}</div>}
        {error && <div role="alert" className="em-auth-alert em-auth-alert--error">{error}</div>}
        {!message && <button className="em-auth-submit" type="submit" disabled={busy}>
          {busy ? <><span className="em-auth-spinner" /> Đang xử lý…</> : info[mode].action}
        </button>}
      </form>}
    <p className="em-auth-switch"><Link to="/login">← Quay lại đăng nhập</Link></p>
  </AuthShell>;
}
