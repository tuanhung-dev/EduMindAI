import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminDashboard, type AdminDashboard } from "../services/adminService";
import "./AdminPages.css";

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getAdminDashboard().then(result => { if (active) setData(result); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "Không tải được báo cáo."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const s = data?.summary;
  const cards = [
    ["Tài khoản", s?.totalUsers], ["Email xác minh (tùy chọn)", s?.verifiedUsers],
    ["Tài khoản bị khóa", s?.suspendedUsers], ["Quản trị viên", s?.adminUsers],
    ["Môn học", s?.subjects], ["Tài liệu PDF", s?.documents],
    ["Đề trắc nghiệm", s?.quizzes], ["Bài thi đã nộp", s?.completedAttempts],
  ] as const;
  const max = Math.max(1, ...((data?.recentActivity ?? []).map(x => x.completedAttempts)));

  return <div className="admin-page">
    <div className="admin-heading">
      <div><p className="admin-eyebrow">QUẢN TRỊ HỆ THỐNG</p><h1>Dashboard Admin</h1>
        <p>Thống kê tổng hợp từ cơ sở dữ liệu EduMind AI.</p></div>
      <Link className="admin-link" to="/app/admin/users">Quản lý người dùng →</Link>
    </div>
    {loading && <p role="status">Đang tải thống kê…</p>}
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {s && <>
      <div className="admin-stats">{cards.map(([label, value]) =>
        <article className="admin-stat" key={label}><span>{label}</span><strong>{value ?? "—"}</strong></article>
      )}</div>
      <div className="admin-panels">
        <section className="admin-panel">
          <h2>Hoạt động nộp bài trong 7 ngày gần nhất</h2>
          <div className="admin-chart" aria-label="Biểu đồ lượt nộp bài theo ngày">
            {data?.recentActivity.map(day => <div className="admin-chart-col" key={day.date}>
              <strong>{day.completedAttempts}</strong>
              <div className="admin-chart-track"><div className="admin-chart-fill" style={{ height: `${Math.max(day.completedAttempts ? 6 : 0, 100 * day.completedAttempts / max)}%` }} /></div>
              <span>{day.date.slice(5)}</span>
            </div>)}
          </div>
        </section>
        <section className="admin-panel admin-help">
          <h2>Tổng quan dữ liệu</h2>
          <p>Điểm trung bình các bài đã nộp: <strong>{s.averageScore.toFixed(1)}%</strong></p>
          <p>Tài liệu chưa gắn chủ sở hữu: <strong>{s.orphanDocuments}</strong></p>
          <p className="admin-note">Dữ liệu PDF cũ chưa gắn người sở hữu vẫn được giữ nguyên và không tự chuyển sang tài khoản khác.</p>
          <Link to="/app/admin/subjects">Quản trị môn học →</Link>
        </section>
      </div>
      <p className="admin-muted">{data?.note}</p>
    </>}
  </div>;
}
