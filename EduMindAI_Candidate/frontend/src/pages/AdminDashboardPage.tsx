import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminDashboard, type AdminDashboard } from "../services/adminService";
import "./AdminDashboardPage.css";

type MetricIconName = "users" | "book" | "files" | "quiz" | "check" | "chart" | "shield" | "alert";

function MetricIcon({ name }: { name: MetricIconName }) {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {name === "users" && <><circle cx="9" cy="8" r="3" /><path d="M3 19v-1a6 6 0 0 1 12 0v1H3ZM17 6a3 3 0 0 1 0 6M18 15a4 4 0 0 1 3 4" /></>}
      {name === "book" && <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 1 4 16.5v-11Z" /><path d="M4 16.5A2.5 2.5 0 0 1 6.5 14H20M8 7h8" /></>}
      {name === "files" && <><path d="M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M15 3v5h5M9 12h7M9 16h7M3 8v13" /></>}
      {name === "quiz" && <><path d="M8 3h8l3 3v14H5V3h3Z" /><path d="m9 11 2 2 4-4M9 17h6" /></>}
      {name === "check" && <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 3 3 5-6" /></>}
      {name === "chart" && <><path d="M4 19V5M4 19h16M8 15l4-4 3 2 5-7" /></>}
      {name === "shield" && <><path d="M12 2 4 5v6c0 5 3 8.5 8 11 5-2.5 8-6 8-11V5l-8-3Z" /><path d="M9 12h6M12 9v6" /></>}
      {name === "alert" && <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5M12 18h.01" /></>}
    </svg>
  );
}

function formatValue(value: number | undefined, suffix = "") {
  return typeof value === "number" && Number.isFinite(value)
    ? `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value)}${suffix}`
    : "—";
}

function dayLabel(dateString: string) {
  const date = new Date(`${dateString}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? dateString
    : date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

const plannedModules = [
  { name: "Quản lý tài liệu toàn hệ thống", detail: "Chờ API Admin để duyệt, phân loại và kiểm tra tài liệu của các tài khoản." },
  { name: "Quản lý đề thi và lượt làm bài", detail: "Chờ API Admin để quản lý toàn bộ đề và báo cáo chi tiết." },
  { name: "Giám sát hoạt động Gia sư AI", detail: "Chờ dữ liệu Admin về lỗi, thời gian phản hồi và mức sử dụng AI." },
  { name: "Nhật ký và cấu hình hệ thống", detail: "Chưa có API quản trị nhật ký hoặc cấu hình trên giao diện." },
];

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    getAdminDashboard()
      .then(result => {
        if (!active) return;
        setDashboard(result);
        setLastUpdated(new Date());
        setError("");
      })
      .catch(reason => {
        if (!active) return;
        setDashboard(null);
        setError(reason instanceof Error ? reason.message : "Không tải được thống kê quản trị.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey]);

  function refresh() {
    if (loading) return;
    setLoading(true);
    setError("");
    setRefreshKey(value => value + 1);
  }

  const summary = dashboard?.summary;
  const metrics: { label: string; value: string; hint: string; icon: MetricIconName; tone?: "warning" }[] = [
    { label: "Người dùng", value: formatValue(summary?.totalUsers), hint: "Tài khoản trong hệ thống", icon: "users" },
    { label: "Môn học", value: formatValue(summary?.subjects), hint: "Danh mục môn học", icon: "book" },
    { label: "Tài liệu", value: formatValue(summary?.documents), hint: "Word / PDF đã lưu", icon: "files" },
    { label: "Đề luyện thi", value: formatValue(summary?.quizzes), hint: "Bộ đề đã tạo", icon: "quiz" },
    { label: "Lượt nộp bài", value: formatValue(summary?.completedAttempts), hint: "Tổng lượt đã nộp", icon: "check" },
    { label: "Điểm trung bình", value: formatValue(summary?.averageScore, "%"), hint: "Các bài đã có điểm", icon: "chart" },
    { label: "Tài khoản bị khóa", value: formatValue(summary?.suspendedUsers), hint: "Cần theo dõi quyền truy cập", icon: "shield", tone: "warning" },
    { label: "Tài liệu thiếu chủ sở hữu", value: formatValue(summary?.orphanDocuments), hint: "Dữ liệu cũ cần rà soát", icon: "alert", tone: "warning" },
  ];

  const days = useMemo(() => [...(dashboard?.recentActivity ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [dashboard]);
  const maxAttempts = Math.max(1, ...days.map(day => day.completedAttempts));
  const weekTotal = days.reduce((total, day) => total + day.completedAttempts, 0);
  const notices = summary ? [
    ...(summary.suspendedUsers > 0 ? [{ text: `Có ${formatValue(summary.suspendedUsers)} tài khoản đang bị khóa.`, href: "/app/admin/users", action: "Kiểm tra người dùng" }] : []),
    ...(summary.orphanDocuments > 0 ? [{ text: `Có ${formatValue(summary.orphanDocuments)} tài liệu chưa gắn chủ sở hữu. Phần FE chưa có thao tác xử lý an toàn.`, href: "", action: "" }] : []),
  ] : [];

  return (
    <div className="adm1-page">
      <header className="adm1-hero">
        <div className="adm1-hero-copy">
          <div className="adm1-kicker"><span className="adm1-kicker-dot" /> EDUMIND AI · TRUNG TÂM QUẢN TRỊ</div>
          <h1>Tổng quan hệ thống</h1>
          <p>Theo dõi học viên, học liệu, đề thi và hoạt động học tập trong một nơi. Số liệu được lấy từ API quản trị hiện có.</p>
          <div className="adm1-hero-facts">
            <span>Chỉ dành cho Admin</span>
            <span>Không hiển thị nội dung tài liệu riêng tư</span>
          </div>
        </div>
        <div className="adm1-hero-actions">
          <button type="button" className="adm1-refresh" disabled={loading} onClick={refresh}>
            <span aria-hidden="true">↻</span> {loading ? "Đang cập nhật…" : "Làm mới số liệu"}
          </button>
          {lastUpdated && <small>Cập nhật lúc {lastUpdated.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</small>}
        </div>
      </header>

      <div className="adm1-main">
        <section aria-labelledby="adm1-summary-title" className="adm1-section">
          <div className="adm1-section-heading">
            <div><span className="adm1-eyebrow">BỨC TRANH TỔNG QUAN</span><h2 id="adm1-summary-title">Tình hình EduMindAI</h2></div>
            {dashboard && <span className="adm1-data-label"><span /> Dữ liệu API thật</span>}
          </div>

          {error && <div className="adm1-error" role="alert">
            <div><strong>Không tải được thống kê Admin</strong><p>{error}</p><small>Nếu HTTP 403, hãy kiểm tra tài khoản hiện tại có vai trò Admin.</small></div>
            <button type="button" onClick={refresh}>Thử lại</button>
          </div>}

          {loading ? (
            <div className="adm1-metrics" role="status" aria-label="Đang tải số liệu quản trị">
              {Array.from({ length: 8 }, (_, index) => <div className="adm1-metric adm1-metric-skeleton" key={index}><span /><i /><b /></div>)}
              <span className="adm1-visually-hidden">Đang tải thống kê quản trị…</span>
            </div>
          ) : dashboard ? (
            <div className="adm1-metrics">
              {metrics.map(metric => <article className={`adm1-metric ${metric.tone === "warning" ? "adm1-metric--warning" : ""}`} key={metric.label}>
                <span className="adm1-metric-icon"><MetricIcon name={metric.icon} /></span>
                <span className="adm1-metric-label">{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.hint}</small>
              </article>)}
            </div>
          ) : null}
        </section>

        {dashboard && <div className="adm1-columns">
          <section className="adm1-panel" aria-labelledby="adm1-activity-title">
            <div className="adm1-panel-heading"><div><span className="adm1-eyebrow">HOẠT ĐỘNG HỌC TẬP</span><h2 id="adm1-activity-title">Lượt nộp bài trong 7 ngày</h2></div><strong className="adm1-week-total">{formatValue(weekTotal)} lượt</strong></div>
            {days.length === 0 ? <div className="adm1-empty">Chưa có dữ liệu hoạt động theo ngày.</div> : <>
              <div className="adm1-chart" role="img" aria-label={`Biểu đồ lượt nộp bài 7 ngày, tổng ${weekTotal} lượt`}>
                {days.map(day => <div className="adm1-chart-col" key={day.date} title={`${dayLabel(day.date)}: ${day.completedAttempts} lượt`}>
                  <span className="adm1-chart-value">{day.completedAttempts}</span>
                  <div className="adm1-chart-track"><div className="adm1-chart-bar" style={{ height: `${day.completedAttempts ? Math.max(5, day.completedAttempts / maxAttempts * 100) : 0}%` }} /></div>
                  <span className="adm1-chart-day">{dayLabel(day.date)}</span>
                </div>)}
              </div>
              {weekTotal === 0 && <p className="adm1-muted">Chưa ghi nhận lượt nộp bài trong 7 ngày được thống kê.</p>}
              <details className="adm1-data-details"><summary>Xem số liệu từng ngày</summary>
                <table><thead><tr><th>Ngày</th><th>Lượt nộp bài</th></tr></thead><tbody>{days.map(day => <tr key={day.date}><td>{dayLabel(day.date)}</td><td>{day.completedAttempts}</td></tr>)}</tbody></table>
              </details>
            </>}
          </section>

          <section className="adm1-panel" aria-labelledby="adm1-review-title">
            <div className="adm1-panel-heading"><div><span className="adm1-eyebrow">ĐIỂM CẦN THEO DÕI</span><h2 id="adm1-review-title">Rà soát dữ liệu</h2></div></div>
            <div className="adm1-review-summary">
              <span>Quản trị viên <strong>{formatValue(summary?.adminUsers)}</strong></span>
              <span>Email đã xác minh <strong>{formatValue(summary?.verifiedUsers)}</strong></span>
            </div>
            {notices.length ? <ul className="adm1-notices">{notices.map(note => <li key={note.text}>
              <span className="adm1-notice-dot" aria-hidden="true" />
              <div><p>{note.text}</p>{note.href && <Link to={note.href}>{note.action} ↗</Link>}</div>
            </li>)}</ul> : <div className="adm1-all-clear"><span aria-hidden="true">✓</span><div><strong>Chưa có mục cần chú ý trong các chỉ số theo dõi.</strong><p>Tiếp tục kiểm tra dữ liệu định kỳ.</p></div></div>}
            <p className="adm1-muted">{dashboard.note || "Thống kê được tổng hợp từ dữ liệu hệ thống."}</p>
          </section>
        </div>}

        <section className="adm1-section" aria-labelledby="adm1-actions-title">
          <div className="adm1-section-heading"><div><span className="adm1-eyebrow">TRUY CẬP NHANH</span><h2 id="adm1-actions-title">Các khu vực đang quản lý được</h2><p>Những chức năng dưới đây đã có trang Admin và API tương ứng.</p></div></div>
          <div className="adm1-action-grid">
            <Link className="adm1-action-card" to="/app/admin/users">
              <span className="adm1-action-icon"><MetricIcon name="users" /></span><span className="adm1-action-status">Đã có chức năng</span>
              <h3>Quản lý người dùng</h3><p>Tìm tài khoản, cấp hoặc hạ quyền, khóa và mở khóa theo quy tắc hệ thống.</p>
              <span className="adm1-action-link">Mở quản lý người dùng <b aria-hidden="true">↗</b></span>
            </Link>
            <Link className="adm1-action-card" to="/app/admin/subjects">
              <span className="adm1-action-icon"><MetricIcon name="book" /></span><span className="adm1-action-status">Đã có chức năng</span>
              <h3>Quản lý môn học</h3><p>Tạo môn học, tìm kiếm và điều chỉnh trạng thái hiển thị cho học viên.</p>
              <span className="adm1-action-link">Mở quản lý môn học <b aria-hidden="true">↗</b></span>
            </Link>
          </div>
        </section>

        <section className="adm1-section" aria-labelledby="adm1-roadmap-title">
          <div className="adm1-section-heading"><div><span className="adm1-eyebrow">LỘ TRÌNH QUẢN TRỊ</span><h2 id="adm1-roadmap-title">Các phân hệ cần phát triển tiếp</h2><p>Hiển thị kế hoạch chức năng; chưa có thao tác quản lý cho những mục này.</p></div></div>
          <div className="adm1-roadmap-grid">
            {plannedModules.map((module, index) => <article className="adm1-roadmap-item" key={module.name}>
              <span className="adm1-roadmap-number">{String(index + 1).padStart(2, "0")}</span>
              <div><h3>{module.name}</h3><p>{module.detail}</p><span className="adm1-roadmap-state">Chưa hỗ trợ API Admin</span></div>
            </article>)}
          </div>
        </section>
      </div>
    </div>
  );
}
