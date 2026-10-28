import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import PageErrorBoundary from "../components/PageErrorBoundary";
import "../styles/Step29Ux.css";
import "../styles/EduMindRedesign.css";
import "../styles/GroupCExperience.css";

// Bước 29: giữ toàn bộ đường dẫn đã có từ Bước 26–28.
const menuItems = [
  { path: "/app", icon: "⌂", label: "Bắt đầu", end: true },
  { path: "/app/documents", icon: "▤", label: "Kho tài liệu" },
  { path: "/app/ai-tutor", icon: "✦", label: "Gia sư AI" },
  { path: "/app/quizzes", icon: "◉", label: "Luyện thi AI" },
  { path: "/app/study-plan", icon: "◇", label: "Lộ trình học" },
  { path: "/app/progress", icon: "▥", label: "Kết quả luyện thi" },
  { path: "/app/account", icon: "⚙", label: "Tài khoản" },
];

const adminItems = [
  { path: "/app/admin", icon: "◫", label: "Dashboard Admin", end: true },
  { path: "/app/admin/users", icon: "◉", label: "Quản lý người dùng" },
  { path: "/app/admin/subjects", icon: "⚙", label: "Quản trị môn học" },
];

function getPageName(pathname: string) {
  if (pathname.includes("/attempts/") && pathname.endsWith("/take")) return "Làm bài trắc nghiệm";
  if (pathname.includes("/results/")) return "Kết quả bài thi";
  const matched = [...adminItems, ...menuItems].find((item) => item.path === pathname);
  return matched?.label ?? "Không gian học tập";
}

export default function AppLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  // Gắn trạng thái mở với location.key để đóng menu khi điều hướng,
  // kể cả khi người dùng bấm Back/Forward trên trình duyệt.
  const [drawerKey, setDrawerKey] = useState<string | null>(null);
  const isDrawerOpen = drawerKey === location.key;
  const pageName = getPageName(location.pathname);
  const initials = (user?.email?.split("@")[0] || "ED").slice(0, 2).toUpperCase();

  const closeDrawer = (restoreFocus = false) => {
    setDrawerKey(null);
    if (restoreFocus) menuButtonRef.current?.focus();
  };

  useEffect(() => {
    document.title = `${pageName} | EduMind AI`;
  }, [pageName]);

  useEffect(() => {
    if (!isDrawerOpen || !window.matchMedia("(max-width: 900px)").matches) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const sidebar = sidebarRef.current;
    // Chuyển focus vào menu khi mở bằng bàn phím.
    sidebar?.querySelector<HTMLButtonElement>(".ux29-close")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrawerKey(null);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !sidebar) return;
      const visible = Array.from(sidebar.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((node) => node.getClientRects().length > 0);
      if (visible.length === 0) return;
      const first = visible[0];
      const last = visible[visible.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) {
        setDrawerKey(null);
      }
    };
    const media = window.matchMedia("(min-width: 901px)");
    media.addEventListener("change", onDesktop);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      media.removeEventListener("change", onDesktop);
    };
  }, [isDrawerOpen]);

  return (
    <div className="app-layout ux29-layout edm30-shell">
      <a className="ux29-skip-link" href="#edumind-main">Bỏ qua menu, đến nội dung</a>

      {isDrawerOpen && (
        <button
          className="ux29-backdrop"
          type="button"
          aria-label="Đóng menu điều hướng"
          tabIndex={-1}
          onClick={() => closeDrawer(true)}
        />
      )}

      <aside
        ref={sidebarRef}
        className={`sidebar ux29-sidebar ${isDrawerOpen ? "ux29-sidebar-open" : ""}`}
        id="edumind-sidebar"
        aria-label="Menu điều hướng EduMind AI"
        role={isDrawerOpen ? "dialog" : undefined}
        aria-modal={isDrawerOpen ? true : undefined}
      >
        <div className="brand ux29-brand">
          <div className="brand-logo" aria-hidden="true">✦</div>
          <div>
            <h2>EduMind AI</h2>
            <p>Smart Learning Platform</p>
          </div>
          <button
            type="button"
            className="ux29-close"
            aria-label="Đóng menu"
            onClick={() => closeDrawer(true)}
          >
            ×
          </button>
        </div>

        <div className="menu-label">KHÔNG GIAN HỌC TẬP</div>
        <nav className="sidebar-menu" aria-label="Điều hướng chính">
          {user?.role === "Admin" && (
            <>
              <span className="ux29-menu-group-label">QUẢN TRỊ HỆ THỐNG</span>
              {adminItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  onClick={() => closeDrawer()}
                  className={({ isActive }) => `menu-item ${isActive ? "active" : ""}`}
                >
                  <span className="menu-icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
              <span className="ux29-menu-group-label">DÀNH CHO HỌC VIÊN</span>
            </>
          )}
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              onClick={() => closeDrawer()}
              className={({ isActive }) => `menu-item ${isActive ? "active" : ""}`}
            >
              <span className="menu-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <NavLink to="/app/ai-tutor" className="edm30-sidebar-ai" onClick={() => closeDrawer()}>
            <span className="edm30-sidebar-ai-icon" aria-hidden="true">✦</span>
            <span><strong>Hỏi Gia sư AI</strong><small>Hỏi đáp từ Word và PDF</small></span>
            <span aria-hidden="true">↗</span>
          </NavLink>
          <p className="copyright">EduMind AI © 2026</p>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar ux29-topbar">
          <div className="ux29-heading-group">
            <button
              ref={menuButtonRef}
              type="button"
              className="ux29-menu-toggle"
              aria-label="Mở menu điều hướng"
              aria-controls="edumind-sidebar"
              aria-expanded={isDrawerOpen}
              onClick={() => setDrawerKey(location.key)}
            >
              <span aria-hidden="true">☰</span>
            </button>
            <div className="ux29-breadcrumbs">
              <span className="breadcrumb">Không gian học tập / </span>
              <strong>{pageName}</strong>
            </div>
          </div>
          <div className="topbar-right ux29-user-group">
            <span className="environment-tag">{user?.role === "Admin" ? "Quản trị viên" : "Học viên"}</span>
            <span className="ux29-email" title={user?.email}>{user?.email}</span>
            <button type="button" className="ux29-logout" aria-label="Đăng xuất" onClick={logout}>
              <span aria-hidden="true">↪</span> <span>Đăng xuất</span>
            </button>
            <div className="avatar" aria-hidden="true">{initials}</div>
          </div>
        </header>

        <main className="page-container ux29-main" id="edumind-main" tabIndex={-1}>
          <PageErrorBoundary key={location.key}>
            <Outlet />
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  );
}
