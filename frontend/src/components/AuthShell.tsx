import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import "../pages/AuthExperience.css";

type AuthShellProps = {
  children: ReactNode;
  active?: "login" | "register";
  eyebrow: string;
  title: string;
  subtitle: string;
};

export function AuthMark({ size = "regular" }: { size?: "regular" | "large" }) {
  return (
    <span className={`em-auth-mark em-auth-mark--${size}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none" focusable="false">
        <path d="M16 2.5c1.5 7.35 6.15 12 13.5 13.5C22.15 17.5 17.5 22.15 16 29.5 14.5 22.15 9.85 17.5 2.5 16 9.85 14.5 14.5 9.85 16 2.5Z" fill="currentColor" />
      </svg>
    </span>
  );
}

function CheckIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}

export default function AuthShell({ children, active, eyebrow, title, subtitle }: AuthShellProps) {
  return (
    <main className="em-auth-page">
      <section className="em-auth-story" aria-label="Giới thiệu EduMind AI">
        <div className="em-auth-story__glow em-auth-story__glow--top" aria-hidden="true" />
        <div className="em-auth-story__glow em-auth-story__glow--bottom" aria-hidden="true" />
        <div className="em-auth-story__content">
          <Link to="/login" className="em-auth-brand" aria-label="EduMind AI - Trang đăng nhập">
            <AuthMark />
            <span className="em-auth-brand__text"><strong>EduMind AI</strong><small>SMART LEARNING PLATFORM</small></span>
          </Link>
          <div className="em-auth-story__message">
            <span className="em-auth-story__tag"><span aria-hidden="true" className="em-auth-story__tag-dot" /> KHÔNG GIAN HỌC TẬP THÔNG MINH</span>
            <h2>Học thông minh hơn.<br /><span>Tiến bộ mỗi ngày.</span></h2>
            <p>Một không gian học tập tập trung, nơi bạn có thể khai thác tài liệu, luyện tập và theo dõi hành trình học của mình.</p>
            <div className="em-auth-benefits">
              <div><span className="em-auth-benefits__icon"><CheckIcon /></span><span>Hỏi đáp và tóm tắt tài liệu Word, PDF</span></div>
              <div><span className="em-auth-benefits__icon"><CheckIcon /></span><span>Luyện thi AI theo nội dung đang học</span></div>
              <div><span className="em-auth-benefits__icon"><CheckIcon /></span><span>Quản lý tài liệu và theo dõi tiến độ</span></div>
            </div>
          </div>
          <div className="em-auth-story__preview" aria-hidden="true">
            <div className="em-auth-preview__head"><AuthMark /><div><strong>Gia sư AI</strong><small>Trợ lý học tập của bạn</small></div><span className="em-auth-preview__online" /></div>
            <div className="em-auth-preview__bubble em-auth-preview__bubble--user">Giúp mình tóm tắt những ý chính trong tài liệu nhé!</div>
            <div className="em-auth-preview__answer"><span className="em-auth-preview__answer-icon">✦</span><span>Bắt đầu với nội dung trọng tâm, sau đó ôn tập bằng câu hỏi để ghi nhớ lâu hơn.</span></div>
            <div className="em-auth-preview__footer"><span /> <span /> <span /></div>
          </div>
          <p className="em-auth-story__footer">EduMind AI · Học tập theo cách của bạn</p>
        </div>
      </section>

      <section className="em-auth-main" aria-label={title}>
        <div className="em-auth-main__inner">
          <header className="em-auth-main__top">
            <Link to="/login" className="em-auth-mobile-brand" aria-label="EduMind AI"><AuthMark /><strong>EduMind AI</strong></Link>
            <div className="em-auth-navigation" aria-label="Điều hướng tài khoản">
              <Link className={active === "login" ? "is-active" : ""} to="/login" aria-current={active === "login" ? "page" : undefined}>Đăng nhập</Link>
              <Link className={active === "register" ? "is-active" : ""} to="/register" aria-current={active === "register" ? "page" : undefined}>Đăng ký</Link>
            </div>
          </header>
          <div className="em-auth-main__body">
            <div className="em-auth-form-intro">
              <span className="em-auth-eyebrow">{eyebrow}</span>
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            {children}
          </div>
          <footer className="em-auth-main__footer">© {new Date().getFullYear()} EduMind AI <span aria-hidden="true">·</span> Học tập chủ động, mỗi ngày</footer>
        </div>
      </section>
    </main>
  );
}
