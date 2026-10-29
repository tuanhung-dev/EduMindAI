import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { changePassword } from "../services/accountSecurityService";
import {
  PROFILE_CHANGED_EVENT, profileInitials, readLocalProfile,
  saveLocalProfile, type AvatarTheme, type LocalProfile,
} from "../services/localProfileService";
import "./AccountSettingsPage.css";

type AccountTab = "profile" | "security";
const avatarChoices: { value: AvatarTheme; label: string }[] = [
  { value: "forest", label: "Xanh lá" },
  { value: "mint", label: "Xanh mint" },
  { value: "sky", label: "Xanh trời" },
];

export default function AccountSettingsPage() {
  const { user, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: AccountTab = searchParams.get("tab") === "security" ? "security" : "profile";

  const [profile, setProfile] = useState<LocalProfile>(() => readLocalProfile(user?.id));
  const [profileNotice, setProfileNotice] = useState("");
  const [profileError, setProfileError] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [securityError, setSecurityError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const syncProfile = () => setProfile(readLocalProfile(user?.id));
    window.addEventListener(PROFILE_CHANGED_EVENT, syncProfile);
    window.addEventListener("storage", syncProfile);
    return () => {
      window.removeEventListener(PROFILE_CHANGED_EVENT, syncProfile);
      window.removeEventListener("storage", syncProfile);
    };
  }, [user?.id]);

  const initials = profileInitials(profile.displayName, user?.email ?? "ED");

  function changeTab(nextTab: AccountTab) {
    setSearchParams({ tab: nextTab });
    setProfileNotice("");
    setProfileError("");
    setSecurityError("");
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileNotice("");
    setProfileError("");
    if (!user?.id) return;
    const nextProfile: LocalProfile = {
      displayName: profile.displayName.trim(),
      studyGoal: profile.studyGoal.trim(),
      bio: profile.bio.trim(),
      avatarTheme: profile.avatarTheme,
    };
    if (nextProfile.displayName.length > 60 || nextProfile.studyGoal.length > 120 || nextProfile.bio.length > 240) {
      setProfileError("Thông tin vượt quá độ dài cho phép.");
      return;
    }
    try {
      saveLocalProfile(user.id, nextProfile);
      setProfile(nextProfile);
      setProfileNotice("Đã lưu thông tin hiển thị trên trình duyệt này.");
    } catch {
      setProfileError("Trình duyệt không cho phép lưu. Kiểm tra quyền lưu trữ hoặc chế độ riêng tư.");
    }
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSecurityError("");
    if (next !== confirm) { setSecurityError("Hai mật khẩu mới chưa khớp."); return; }
    if (current === next) { setSecurityError("Mật khẩu mới phải khác mật khẩu hiện tại."); return; }
    if (next.length < 10 || !/[a-z]/.test(next) || !/[A-Z]/.test(next) || !/\d/.test(next) || !/[^a-zA-Z0-9]/.test(next)) {
      setSecurityError("Mật khẩu cần ít nhất 10 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt."); return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      logout(); // Backend đã đổi mật khẩu: yêu cầu đăng nhập lại.
    } catch (err) {
      setSecurityError(err instanceof Error ? err.message : "Đổi mật khẩu không thành công.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="eac-page">
      <header className="eac-hero">
        <div>
          <span className="eac-eyebrow">EDUMIND AI · TÀI KHOẢN VÀ CÀI ĐẶT</span>
          <h1>Không gian của riêng bạn.</h1>
          <p>Cập nhật hồ sơ hiển thị, thiết lập mục tiêu học tập và bảo vệ tài khoản EduMindAI.</p>
          <Link to="/app" className="eac-back">← Trở về Trang chủ</Link>
        </div>
        <div className="eac-hero-portrait" aria-hidden="true">{initials}</div>
      </header>

      <section className="eac-content" aria-label="Thiết lập tài khoản">
        <aside className="eac-summary">
          <div className={`eac-avatar eac-avatar--${profile.avatarTheme}`} aria-hidden="true">{initials}</div>
          <h2>{profile.displayName.trim() || user?.email?.split("@")[0] || "Học viên"}</h2>
          <p className="eac-email" title={user?.email}>{user?.email}</p>
          <span className="eac-role">{user?.role === "Admin" ? "Quản trị viên" : "Học viên"} · Đang đăng nhập</span>
          {profile.studyGoal && <div className="eac-goal"><strong>Mục tiêu học tập</strong><p>{profile.studyGoal}</p></div>}
          <p className="eac-local-note">Tên hiển thị, giới thiệu và màu avatar chỉ lưu trên thiết bị này. Email và vai trò do hệ thống xác thực quản lý.</p>
        </aside>

        <div className="eac-settings-main">
          <div className="eac-tabs" role="group" aria-label="Danh mục cài đặt">
            <button type="button" className={tab === "profile" ? "active" : ""} aria-pressed={tab === "profile"} onClick={() => changeTab("profile")}>♙ Hồ sơ cá nhân</button>
            <button type="button" className={tab === "security" ? "active" : ""} aria-pressed={tab === "security"} onClick={() => changeTab("security")}>⚿ Bảo mật tài khoản</button>
          </div>

          {tab === "profile" ? (
            <section className="eac-panel" aria-labelledby="eac-profile-heading">
              <div className="eac-panel-head"><span>CÁ NHÂN HÓA</span><h2 id="eac-profile-heading">Chỉnh sửa thông tin</h2><p>Những thay đổi ở đây được lưu cục bộ và cập nhật ngay trên avatar Header.</p></div>
              <form onSubmit={saveProfile} className="eac-form">
                <div className="eac-field"><label htmlFor="eac-name">Tên hiển thị</label><input id="eac-name" type="text" maxLength={60} placeholder="Ví dụ: Nguyễn Văn A" value={profile.displayName} onChange={event => setProfile(p => ({ ...p, displayName: event.target.value }))} /><small>{profile.displayName.length}/60 ký tự</small></div>
                <div className="eac-field"><label htmlFor="eac-email">Địa chỉ email</label><input id="eac-email" type="email" value={user?.email ?? ""} disabled /><small>Email đăng nhập không thể thay đổi bằng giao diện này.</small></div>
                <div className="eac-field"><label htmlFor="eac-goal">Mục tiêu học tập</label><input id="eac-goal" type="text" maxLength={120} placeholder="Ví dụ: Ôn tập 30 phút mỗi ngày" value={profile.studyGoal} onChange={event => setProfile(p => ({ ...p, studyGoal: event.target.value }))} /></div>
                <div className="eac-field"><label htmlFor="eac-bio">Giới thiệu ngắn</label><textarea id="eac-bio" rows={3} maxLength={240} placeholder="Bạn đang học gì, muốn cải thiện điều gì?" value={profile.bio} onChange={event => setProfile(p => ({ ...p, bio: event.target.value }))} /><small>{profile.bio.length}/240 ký tự</small></div>
                <fieldset className="eac-colors"><legend>Màu avatar</legend><div className="eac-colors-list">{avatarChoices.map(choice => <label key={choice.value} className={profile.avatarTheme === choice.value ? "selected" : ""}><input type="radio" name="avatar-theme" value={choice.value} checked={profile.avatarTheme === choice.value} onChange={() => setProfile(p => ({ ...p, avatarTheme: choice.value }))} /><span className={`eac-color-dot eac-avatar--${choice.value}`} aria-hidden="true">{initials}</span><span>{choice.label}</span></label>)}</div></fieldset>
                {profileError && <p role="alert" className="eac-message eac-message-error">{profileError}</p>}
                {profileNotice && <p role="status" className="eac-message eac-message-success">{profileNotice}</p>}
                <button type="submit" className="eac-save">✓ Lưu thay đổi</button>
              </form>
            </section>
          ) : (
            <section className="eac-panel" aria-labelledby="eac-security-heading">
              <div className="eac-panel-head"><span>BẢO MẬT</span><h2 id="eac-security-heading">Đổi mật khẩu</h2><p>Sử dụng mật khẩu mạnh để bảo vệ tài liệu và các cuộc trò chuyện của bạn.</p></div>
              <form className="eac-form" onSubmit={submitPassword}>
                <div className="eac-field"><label htmlFor="eac-current">Mật khẩu hiện tại</label><input id="eac-current" type={showPasswords ? "text" : "password"} autoComplete="current-password" required value={current} onChange={event => setCurrent(event.target.value)} /></div>
                <div className="eac-field"><label htmlFor="eac-new">Mật khẩu mới</label><input id="eac-new" type={showPasswords ? "text" : "password"} minLength={10} autoComplete="new-password" required value={next} onChange={event => setNext(event.target.value)} /></div>
                <div className="eac-field"><label htmlFor="eac-confirm">Nhập lại mật khẩu mới</label><input id="eac-confirm" type={showPasswords ? "text" : "password"} minLength={10} autoComplete="new-password" required value={confirm} onChange={event => setConfirm(event.target.value)} /></div>
                <label className="eac-show-password"><input type="checkbox" checked={showPasswords} onChange={event => setShowPasswords(event.target.checked)} /> Hiện mật khẩu</label>
                <p className="eac-local-note">Ít nhất 10 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt. Sau khi đổi thành công, bạn sẽ cần đăng nhập lại.</p>
                {securityError && <p className="eac-message eac-message-error" role="alert">{securityError}</p>}
                <button type="submit" className="eac-save" disabled={busy}>{busy ? "Đang cập nhật…" : "Đổi mật khẩu"}</button>
              </form>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
