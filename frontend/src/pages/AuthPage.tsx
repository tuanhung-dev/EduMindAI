import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import AuthShell from "../components/AuthShell";
import { isStrongPassword, isValidEmail, passwordRules } from "../utils/authValidation";

type AuthMode = "login" | "register";

function EyeIcon({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 3 18 18" /><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c5 0 9 4.5 10 7-0.4 1-1.5 2.6-3 4" /><path d="M6.4 6.4C4.2 7.8 2.8 10.1 2 12c1 2.5 5 7 10 7 1.7 0 3.2-.5 4.6-1.3" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
  );
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}

function PasswordRules({ value }: { value: string }) {
  const passed = passwordRules.filter((rule) => rule.test(value)).length;
  return (
    <div className="em-auth-password-help" id="em-auth-password-rules">
      <div className="em-auth-strength" aria-label={`Đáp ứng ${passed} trên 5 điều kiện mật khẩu`}>
        {passwordRules.map((rule) => <span key={rule.label} className={rule.test(value) ? "is-valid" : ""} />)}
      </div>
      <div className="em-auth-requirements">
        {passwordRules.map((rule) => <span className={rule.test(value) ? "is-valid" : ""} key={rule.label}>
          <span aria-hidden="true">{rule.test(value) ? "✓" : "○"}</span>{rule.label}
        </span>)}
      </div>
    </div>
  );
}

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const { user, checking, login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false, confirm: false });
  const [error, setError] = useState("");

  const isRegister = mode === "register";
  const emailValid = isValidEmail(email);
  const passwordValid = isRegister ? isStrongPassword(password) : password.length > 0;
  const confirmValid = confirm.length > 0 && confirm === password;
  const emailError = (submitted || touched.email) && !emailValid;
  const passwordError = (submitted || touched.password) && !passwordValid;
  const confirmError = isRegister && (submitted || touched.confirm) && !confirmValid;

  if (user) return <Navigate to="/app" replace />;

  function updateCaps(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || checking) return;
    setSubmitted(true);
    setError("");
    if (!emailValid || !passwordValid || (isRegister && !confirmValid)) return;
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
      setError(err instanceof Error ? err.message : "Không thể hoàn thành yêu cầu. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      active={mode}
      eyebrow={isRegister ? "BẮT ĐẦU HÀNH TRÌNH" : "CHÀO MỪNG QUAY LẠI"}
      title={isRegister ? "Tạo tài khoản" : "Chào mừng trở lại"}
      subtitle={isRegister ? "Đăng ký miễn phí để lưu tài liệu, trao đổi cùng Gia sư AI và theo dõi kết quả học tập." : "Đăng nhập để tiếp tục hành trình học tập cùng EduMind AI."}
    >
      {!isRegister && params.get("registered") === "1" && (
        <div role="status" className="em-auth-alert em-auth-alert--success">✓ Đăng ký thành công! Bạn có thể đăng nhập ngay.</div>
      )}
      {checking ? (
        <div className="em-auth-checking" role="status"><span className="em-auth-spinner" /> Đang kiểm tra phiên đăng nhập…</div>
      ) : (
        <form className="em-auth-form" onSubmit={submit} noValidate aria-busy={busy}>
          <div className="em-auth-field">
            <label htmlFor="auth-email">Địa chỉ email</label>
            <div className={`em-auth-control ${emailError ? "has-error" : ""}`}>
              <span className="em-auth-control__icon" aria-hidden="true">@</span>
              <input id="auth-email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="tenban@example.com"
                required maxLength={254} spellCheck={false} value={email} disabled={busy}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                onBlur={() => setTouched(s => ({ ...s, email: true }))}
                aria-invalid={emailError} aria-describedby={emailError ? "auth-email-error" : undefined}/>
            </div>
            {emailError && <p id="auth-email-error" className="em-auth-field-error">Vui lòng nhập địa chỉ email hợp lệ.</p>}
          </div>

          <div className="em-auth-field">
            <div className="em-auth-field__heading">
              <label htmlFor="auth-password">Mật khẩu</label>
              {!isRegister && <Link className="em-auth-inline-link" to="/forgot-password">Quên mật khẩu?</Link>}
            </div>
            <div className={`em-auth-control ${passwordError ? "has-error" : ""}`}>
              <span className="em-auth-control__icon" aria-hidden="true">✳</span>
              <input id="auth-password" name="password" type={showPassword ? "text" : "password"}
                placeholder={isRegister ? "Tạo mật khẩu mạnh" : "Nhập mật khẩu của bạn"}
                required minLength={isRegister ? 10 : 1} autoComplete={isRegister ? "new-password" : "current-password"}
                value={password} disabled={busy} onChange={(e) => { setPassword(e.target.value); setError(""); }}
                onBlur={() => { setTouched(s => ({ ...s, password: true })); setCapsLock(false); }}
                onKeyDown={updateCaps} onKeyUp={updateCaps}
                aria-invalid={passwordError} aria-describedby={isRegister ? (passwordError ? "auth-password-error em-auth-password-rules" : "em-auth-password-rules") : passwordError ? "auth-password-error" : undefined}/>
              <button className="em-auth-visibility" type="button" disabled={busy} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-pressed={showPassword} onClick={() => setShowPassword(s => !s)}><EyeIcon hidden={showPassword}/></button>
            </div>
            {capsLock && <p className="em-auth-caps" role="status">Phím Caps Lock đang bật.</p>}
            {passwordError && <p id="auth-password-error" className="em-auth-field-error">{isRegister ? "Mật khẩu chưa đáp ứng đủ điều kiện bên dưới." : "Vui lòng nhập mật khẩu."}</p>}
            {isRegister && <PasswordRules value={password} />}
          </div>

          {isRegister && <div className="em-auth-field">
            <label htmlFor="auth-confirm">Nhập lại mật khẩu</label>
            <div className={`em-auth-control ${confirmError ? "has-error" : ""}`}>
              <span className="em-auth-control__icon" aria-hidden="true">✳</span>
              <input id="auth-confirm" name="confirm" type={showConfirm ? "text" : "password"} placeholder="Nhập lại mật khẩu vừa tạo"
                autoComplete="new-password" required minLength={10} disabled={busy} value={confirm}
                onChange={e => { setConfirm(e.target.value); setError(""); }}
                onBlur={() => setTouched(s => ({ ...s, confirm: true }))}
                aria-invalid={confirmError} aria-describedby={confirmError ? "auth-confirm-error" : undefined}/>
              <button className="em-auth-visibility" type="button" disabled={busy} aria-label={showConfirm ? "Ẩn mật khẩu xác nhận" : "Hiện mật khẩu xác nhận"}
                aria-pressed={showConfirm} onClick={() => setShowConfirm(s => !s)}><EyeIcon hidden={showConfirm}/></button>
            </div>
            {confirmError && <p className="em-auth-field-error" id="auth-confirm-error">Mật khẩu xác nhận không khớp.</p>}
          </div>}

          {error && <div className="em-auth-alert em-auth-alert--error" role="alert">{error}</div>}
          <button type="submit" className="em-auth-submit" disabled={busy}>
            {busy ? <><span className="em-auth-spinner" /> {isRegister ? "Đang tạo tài khoản…" : "Đang đăng nhập…"}</>
              : <>{isRegister ? "Tạo tài khoản" : "Đăng nhập"}<ArrowIcon /></>}
          </button>
          <p className="em-auth-switch">
            {isRegister ? "Bạn đã có tài khoản?" : "Chưa có tài khoản?"} <Link to={isRegister ? "/login" : "/register"}>{isRegister ? "Đăng nhập ngay" : "Đăng ký miễn phí"}</Link>
          </p>
        </form>
      )}
      <div className="em-auth-footnote"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg> Chỉ đăng nhập bằng tài khoản EduMind AI của bạn.</div>
    </AuthShell>
  );
}
