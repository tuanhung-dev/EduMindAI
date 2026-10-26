import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  getAdminUsers, setAdminUserRole, setAdminUserStatus,
  type AdminUser, type UserPage,
} from "../services/adminService";
import "./AdminPages.css";

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UserPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    setError(""); setLoading(true);
    try { setData(await getAdminUsers(term, page)); }
    catch (err) { setError(err instanceof Error ? err.message : "Không tải được danh sách."); }
    finally { setLoading(false); }
  }, [term, page]);
  useEffect(() => {
    let active = true;
    getAdminUsers(term, page)
      .then(result => { if (active) setData(result); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "Không tải được danh sách."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [term, page]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requested = search.trim();
    if (requested === term && page === 1) { void reload(); return; }
    setLoading(true); setPage(1); setTerm(requested);
  }
  async function changeStatus(account: AdminUser) {
    const next = !account.suspended;
    if (!window.confirm(`${next ? "Khóa" : "Mở khóa"} tài khoản ${account.email || account.id}?`)) return;
    setBusyId(account.id); setNotice(""); setError("");
    try { await setAdminUserStatus(account.id, next); setNotice("Đã cập nhật trạng thái tài khoản."); await reload(); }
    catch (err) { setError(err instanceof Error ? err.message : "Không cập nhật được."); }
    finally { setBusyId(null); }
  }
  async function changeRole(account: AdminUser) {
    const next = account.role === "Admin" ? "Student" : "Admin";
    if (!window.confirm(`Đổi vai trò của ${account.email || account.id} thành ${next}? Hành động này thay đổi quyền truy cập API.`)) return;
    setBusyId(account.id); setNotice(""); setError("");
    try { await setAdminUserRole(account.id, next); setNotice("Đã thay đổi vai trò tài khoản."); await reload(); }
    catch (err) { setError(err instanceof Error ? err.message : "Không cập nhật được."); }
    finally { setBusyId(null); }
  }

  return <div className="admin-page">
    <div className="admin-heading"><div><p className="admin-eyebrow">QUẢN TRỊ HỆ THỐNG</p><h1>Quản lý người dùng</h1>
      <p>Tìm tài khoản và quản lý quyền truy cập. Xác minh email hiện không bắt buộc.</p></div></div>
    <form className="admin-search" onSubmit={submit}>
      <input aria-label="Tìm kiếm email hoặc ID" placeholder="Tìm theo email hoặc ID…" maxLength={100}
        value={search} onChange={e => setSearch(e.target.value)} />
      <button type="submit" disabled={loading}>Tìm kiếm</button>
    </form>
    {error && <p className="admin-alert" role="alert">{error}</p>}
    {notice && <p className="admin-success" role="status">{notice}</p>}
    <div className="admin-panel admin-table-wrap">
      <table className="admin-table"><thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Email</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>
          {data?.items.map(account => {
            const isSelf = account.id === user?.id;
            const disabled = !!busyId || isSelf;
            return <tr key={account.id}>
              <td><strong>{account.email || "(Chưa có email)"}</strong><small title={account.id}>{account.id.slice(0, 12)}…</small></td>
              <td><span className="admin-pill">{account.role}</span></td>
              <td>{account.emailConfirmed ? "Đã xác minh" : "Chưa xác minh"}</td>
              <td>{account.suspended ? <span className="admin-danger">Đang khóa</span> : "Hoạt động"}</td>
              <td><div className="admin-actions">
                <button type="button" disabled={disabled || account.role === "Admin"}
                  title={account.role === "Admin" ? "Không hỗ trợ khóa Admin" : undefined}
                  onClick={() => void changeStatus(account)}>{account.suspended ? "Mở khóa" : "Khóa"}</button>
                <button type="button" disabled={disabled || (account.role === "Student" && account.suspended)}
                  onClick={() => void changeRole(account)}>{account.role === "Admin" ? "Hạ quyền" : "Cấp Admin"}</button>
                {isSelf && <span className="admin-muted">Tài khoản của bạn</span>}
              </div></td>
            </tr>;
          })}
          {!loading && !data?.items.length && <tr><td colSpan={5}>Không tìm thấy tài khoản phù hợp.</td></tr>}
        </tbody></table>
      {loading && <p role="status">Đang tải danh sách…</p>}
    </div>
    {data && <div className="admin-pager">
      <span>{data.total} tài khoản · Trang {data.page} / {Math.max(1, data.totalPages)}</span>
      <div><button type="button" disabled={loading || page <= 1} onClick={() => { setLoading(true); setPage(p => p - 1); }}>← Trước</button>
      <button type="button" disabled={loading || page >= data.totalPages} onClick={() => { setLoading(true); setPage(p => p + 1); }}>Sau →</button></div>
    </div>}
    <p className="admin-muted">Các thay đổi quyền được kiểm tra tại Backend. Không hỗ trợ xóa tài khoản hay tự chuyển dữ liệu cũ sang người dùng khác.</p>
  </div>;
}
