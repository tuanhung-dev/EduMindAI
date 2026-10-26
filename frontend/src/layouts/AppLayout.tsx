
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const menuItems = [
  { path: "/app", icon: "◈", label: "Tổng quan", end: true },
  { path: "/app/subjects", icon: "▦", label: "Môn học" },
  { path: "/app/documents", icon: "▤", label: "Tài liệu của tôi" },
  { path: "/app/ai-tutor", icon: "✦", label: "Gia sư AI" },
  { path: "/app/quizzes", icon: "◉", label: "Luyện thi AI" },
  { path: "/app/progress", icon: "▥", label: "Tiến độ học tập" },
  { path: "/app/account", icon: "⚙", label: "Tài khoản của tôi" },
];

export default function AppLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();

  const currentPage = menuItems.find(
    (item) => item.path === location.pathname
  );
  const adminTitle = location.pathname === "/app/admin" ? "Dashboard Admin" :
    location.pathname === "/app/admin/users" ? "Quản lý người dùng" :
    location.pathname === "/app/admin/subjects" ? "Quản trị môn học" : null;

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">✦</div>
          <div>
            <h2>EduMind AI</h2>
            <p>Smart Learning Platform</p>
          </div>
        </div>

        <div className="menu-label">KHÔNG GIAN HỌC TẬP</div>

        <nav className="sidebar-menu">
          {user?.role === "Admin" && <>
            <NavLink to="/app/admin" end className={({ isActive }) => `menu-item ${isActive ? "active" : ""}`}>◫ Dashboard Admin</NavLink>
            <NavLink to="/app/admin/users" className={({ isActive }) => `menu-item ${isActive ? "active" : ""}`}>◉ Quản lý người dùng</NavLink>
            <NavLink to="/app/admin/subjects" className={({ isActive }) => `menu-item ${isActive ? "active" : ""}`}>⚙ Quản trị môn học</NavLink>
          </>}
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `menu-item ${isActive ? "active" : ""}`
              }
            >
              <span className="menu-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="ai-promo">
            <span>✦ AI POWERED</span>
            <h3>Học từ tài liệu</h3>
            <p>
              Tải PDF, khám phá kiến thức và luyện thi
              cùng trí tuệ nhân tạo.
            </p>
          </div>

          <p className="copyright">EduMind AI © 2026</p>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div>
            <span className="breadcrumb">EduMind AI / </span>
            <strong>{adminTitle || currentPage?.label || "Không gian học tập"}</strong>
          </div>

          <div className="topbar-right">
            <span className="environment-tag">{user?.role === "Admin" ? "Quản trị viên" : "Học viên"}</span>
            <span title={user?.email}>{user?.email}</span>
            <button type="button" onClick={logout} style={{ cursor: "pointer", padding: "7px 10px", borderRadius: 9 }}>Đăng xuất</button>
            <div className="avatar">ED</div>
          </div>
        </header>

        <main className="page-container">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
