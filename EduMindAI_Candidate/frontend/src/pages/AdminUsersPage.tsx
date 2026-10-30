import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  getAdminDashboard,
  getAdminUsers,
  setAdminUserRole,
  setAdminUserStatus,
  type AdminDashboard,
  type AdminUser,
  type UserPage,
} from "../services/adminService";
import "./AdminUsersPage.css";

type RoleFilter = "all" | "Admin" | "Student";
type StatusFilter = "all" | "active" | "suspended";
type Dialog =
  | { kind: "details"; account: AdminUser }
  | { kind: "status"; account: AdminUser; suspended: boolean }
  | { kind: "role"; account: AdminUser; role: "Admin" | "Student" };

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const avatarLetters = (email: string | null): string => {
  const local = (email ?? "").split("@")[0].trim();
  if (!local) return "ND";
  return local.slice(0, 2).toLocaleUpperCase("vi-VN");
};

function AccountBadge({ account }: { account: AdminUser }) {
  return (
    <span className={`eau-state ${account.suspended ? "eau-state--locked" : "eau-state--active"}`}>
      <span className="eau-state-dot" aria-hidden="true" />
      {account.suspended ? "Đang khóa" : "Hoạt động"}
    </span>
  );
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [inputSearch, setInputSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<UserPage | null>(null);
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialogNotice, setDialogNotice] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const actionInFlightRef = useRef(false);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let live = true;
    getAdminUsers(appliedSearch, page)
      .then((result) => {
        if (!live) return;
        setData(result);
        setError("");
      })
      .catch((err: unknown) => {
        if (!live) return;
        setData(null);
        setError(getErrorMessage(err, "Không thể tải danh sách người dùng."));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => { live = false; };
  }, [appliedSearch, page, refreshKey]);

  useEffect(() => {
    let live = true;
    getAdminDashboard()
      .then((result) => {
        if (!live) return;
        setDashboard(result);
        setStatsError(false);
      })
      .catch(() => {
        if (!live) return;
        setDashboard(null);
        setStatsError(true);
      });
    return () => { live = false; };
  }, [refreshKey]);

  const visibleUsers = useMemo(() => {
    return (data?.items ?? []).filter((account) => {
      if (roleFilter !== "all" && account.role !== roleFilter) return false;
      if (statusFilter === "active" && account.suspended) return false;
      if (statusFilter === "suspended" && !account.suspended) return false;
      return true;
    });
  }, [data, roleFilter, statusFilter]);

  const hasLocalFilter = roleFilter !== "all" || statusFilter !== "all";
  const shownPage = data?.page ?? page;
  const totalPages = Math.max(1, data?.totalPages ?? 1);
  const pageUsers = data?.items ?? [];
  const pageAdmins = pageUsers.filter((item) => item.role === "Admin").length;
  const pageLocked = pageUsers.filter((item) => item.suspended).length;

  function refresh() {
    setLoading(true);
    setError("");
    setRefreshKey((value) => value + 1);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = inputSearch.trim();
    setNotice("");
    if (value === appliedSearch && page === 1) {
      refresh();
      return;
    }
    setLoading(true);
    setPage(1);
    setAppliedSearch(value);
    setRoleFilter("all");
    setStatusFilter("all");
    // page/search change triggers the request; avoid duplicate refreshes.
  }

  function resetSearch() {
    setInputSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
    if (appliedSearch || page !== 1) {
      setLoading(true);
      setPage(1);
      setAppliedSearch("");
    }
  }

  function changePage(nextPage: number) {
    if (loading || busyId || nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    setLoading(true);
    setError("");
    setNotice("");
    setPage(nextPage);
  }

  function openDialog(next: Dialog, trigger: HTMLButtonElement) {
    if (busyId || loading) return;
    lastTriggerRef.current = trigger;
    setError("");
    setDialogNotice("");
    setDialog(next);
  }

  function closeDialog() {
    if (busyId) return;
    setDialog(null);
    window.requestAnimationFrame(() => lastTriggerRef.current?.focus());
  }

  useEffect(() => {
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (primaryRef.current) primaryRef.current.focus();
    else modalCloseRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!actionInFlightRef.current) {
          event.preventDefault();
          setDialog(null);
          window.requestAnimationFrame(() => lastTriggerRef.current?.focus());
        }
        return;
      }
      if (event.key !== "Tab") return;
      const interactive = Array.from(
        dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []
      );
      if (!interactive.length) return;
      const first = interactive[0];
      const last = interactive[interactive.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [dialog]);

  async function confirmChange() {
    if (!dialog || dialog.kind === "details" || busyId || actionInFlightRef.current) return;
    const { account } = dialog;
    // Frontend guard; backend authorizes and validates again.
    if (account.id === user?.id) {
      setError("Không thể thay đổi vai trò hoặc khóa tài khoản đang đăng nhập.");
      setDialog(null);
      return;
    }
    if (dialog.kind === "status" && account.role === "Admin") {
      setError("Không thể khóa hoặc mở khóa quản trị viên tại màn hình này.");
      setDialog(null);
      return;
    }
    if (dialog.kind === "role" && dialog.role === "Admin" && account.suspended) {
      setError("Hãy mở khóa tài khoản học viên trước khi cấp quyền Admin.");
      setDialog(null);
      return;
    }

    actionInFlightRef.current = true;
    setBusyId(account.id);
    setError("");
    setNotice("");
    try {
      if (dialog.kind === "status") {
        await setAdminUserStatus(account.id, dialog.suspended);
        setNotice(dialog.suspended ? `Đã khóa ${account.email ?? account.id}.` : `Đã mở khóa ${account.email ?? account.id}.`);
      } else {
        await setAdminUserRole(account.id, dialog.role);
        setNotice(dialog.role === "Admin" ? `Đã cấp quyền Admin cho ${account.email ?? account.id}.` : `Đã chuyển ${account.email ?? account.id} về vai trò Học viên.`);
      }
      setDialog(null);
      setLoading(true);
      setRefreshKey((value) => value + 1);
    } catch (err: unknown) {
      // Keep the dialog open so the administrator can read the error safely.
      setError(getErrorMessage(err, "Không thể thực hiện thay đổi. Vui lòng thử lại."));
    } finally {
      actionInFlightRef.current = false;
      setBusyId(null);
    }
  }

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setDialogNotice("Đã sao chép ID tài khoản.");
      setError("");
    } catch {
      setDialogNotice("Không thể sao chép tự động. Hãy chọn dòng mã tài khoản ở trên để sao chép thủ công.");
    }
  }

  const badgeFor = (label: string, value: number | undefined, icon: string) => (
    <article className="eau-stat" key={label}>
      <span className="eau-stat-icon" aria-hidden="true">{icon}</span>
      <div><span>{label}</span><strong>{value === undefined ? "—" : value.toLocaleString("vi-VN")}</strong></div>
    </article>
  );

  return (
    <div className="eau-page">
      <nav className="eau-breadcrumb" aria-label="Đường dẫn quản trị">
        <Link to="/app/admin">Trung tâm quản trị</Link><span aria-hidden="true">/</span><span>Người dùng</span>
      </nav>

      <header className="eau-hero">
        <div className="eau-hero-copy">
          <span className="eau-eyebrow">EDUMIND AI · ADMIN CONTROL</span>
          <h1>Quản lý người dùng</h1>
          <p>Theo dõi tài khoản, kiểm tra trạng thái và kiểm soát quyền truy cập hệ thống một cách an toàn.</p>
          <div className="eau-hero-tags"><span>✓ Phân quyền rõ ràng</span><span>✓ Xác nhận trước khi thay đổi</span><span>✓ Dữ liệu từ API thật</span></div>
        </div>
        <div className="eau-hero-actions">
          <Link to="/app/admin" className="eau-btn eau-btn-light">← Tổng quan Admin</Link>
          <button type="button" className="eau-btn eau-btn-outline" onClick={refresh} disabled={loading || !!busyId}>↻ Làm mới dữ liệu</button>
        </div>
      </header>

      <section className="eau-stats-section" aria-label="Thống kê tài khoản toàn hệ thống">
        <div className="eau-stats-heading"><h2>Tổng quan tài khoản</h2><span>{statsError ? "Không tải được chỉ số hệ thống" : "Số liệu toàn hệ thống"}</span></div>
        <div className="eau-stats">
          {badgeFor("Tổng tài khoản", dashboard?.summary.totalUsers, "▣")}
          {badgeFor("Quản trị viên", dashboard?.summary.adminUsers, "✦")}
          {badgeFor("Đang bị khóa", dashboard?.summary.suspendedUsers, "⊘")}
          {badgeFor("Email đã xác minh", dashboard?.summary.verifiedUsers, "✓")}
        </div>
      </section>

      <section className="eau-directory" aria-labelledby="eau-directory-title">
        <div className="eau-directory-heading">
          <div><span className="eau-section-kicker">DANH SÁCH VÀ PHÂN QUYỀN</span><h2 id="eau-directory-title">Danh sách người dùng</h2>
            <p>Tìm theo email hoặc ID trên toàn bộ cơ sở dữ liệu; bộ lọc bên dưới chỉ áp dụng cho trang đang xem.</p></div>
        </div>

        <form className="eau-search-form" onSubmit={handleSearch} role="search">
          <label className="eau-search-field" htmlFor="eau-search">
            <span className="eau-search-icon" aria-hidden="true">⌕</span>
            <input id="eau-search" type="search" maxLength={100} value={inputSearch} onChange={(event) => setInputSearch(event.target.value)} placeholder="Tìm theo email hoặc ID tài khoản..." />
          </label>
          <button type="submit" className="eau-btn eau-btn-primary" disabled={loading || !!busyId}>Tìm kiếm</button>
          {(inputSearch || appliedSearch) && <button type="button" className="eau-btn eau-btn-neutral" onClick={resetSearch} disabled={loading || !!busyId}>Xóa tìm kiếm</button>}
        </form>

        <div className="eau-filter-bar">
          <div className="eau-filter-fields">
            <label>Vai trò <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as RoleFilter)} disabled={loading}>
              <option value="all">Tất cả vai trò</option><option value="Admin">Quản trị viên</option><option value="Student">Học viên</option>
            </select></label>
            <label>Trạng thái <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} disabled={loading}>
              <option value="all">Tất cả trạng thái</option><option value="active">Đang hoạt động</option><option value="suspended">Đang khóa</option>
            </select></label>
          </div>
          <span className="eau-filter-hint">Bộ lọc áp dụng trong {pageUsers.length} tài khoản của trang này</span>
        </div>

        {error && <div role="alert" className="eau-alert eau-alert-error"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Đóng lỗi">×</button></div>}
        {notice && <div role="status" className="eau-alert eau-alert-success"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Đóng thông báo">×</button></div>}

        {loading ? <div className="eau-feedback" role="status"><div className="eau-spinner" aria-hidden="true" /><strong>Đang tải danh sách tài khoản...</strong><p>Đang lấy dữ liệu phân trang từ hệ thống.</p></div>
        : !data ? <div className="eau-feedback"><span aria-hidden="true">!</span><strong>Không tải được danh sách</strong><p>Vui lòng kiểm tra kết nối hoặc quyền Admin, sau đó thử lại.</p><button type="button" className="eau-btn eau-btn-primary" onClick={refresh}>Thử tải lại</button></div>
        : data.items.length === 0 ? <div className="eau-feedback"><span aria-hidden="true">⌕</span><strong>Không tìm thấy tài khoản</strong><p>Thử một phần email hoặc ID khác.</p><button type="button" className="eau-btn eau-btn-primary" onClick={resetSearch}>Xóa từ khóa</button></div>
        : visibleUsers.length === 0 ? <div className="eau-feedback"><span aria-hidden="true">▤</span><strong>Không có tài khoản phù hợp bộ lọc</strong><p>Đây chỉ là bộ lọc trên trang hiện tại; thử trang khác hoặc bỏ bộ lọc.</p><button type="button" className="eau-btn eau-btn-primary" onClick={() => { setRoleFilter("all"); setStatusFilter("all"); }}>Bỏ bộ lọc</button></div>
        : <>
          <div className="eau-results-caption" aria-live="polite">
            <span>Hiển thị <strong>{visibleUsers.length}</strong> / {data.items.length} tài khoản của trang {shownPage}; tìm kiếm server có <strong>{data.total.toLocaleString("vi-VN")}</strong> kết quả.</span>
            <span>Trang hiện tại: {pageAdmins} Admin · {pageLocked} đang khóa</span>
          </div>
          <div className="eau-table-scroll" role="region" aria-label="Bảng quản lý người dùng" tabIndex={0}>
            <table className="eau-table"><thead><tr><th scope="col">Người dùng</th><th scope="col">Vai trò</th><th scope="col">Trạng thái</th><th scope="col">Xác minh</th><th scope="col">Quản lý</th></tr></thead>
              <tbody>{visibleUsers.map((account) => {
                const self = account.id === user?.id;
                const blocked = !!busyId || self;
                const canLock = !blocked && account.role !== "Admin";
                const canPromote = !blocked && !(account.role === "Student" && account.suspended);
                return <tr key={account.id}>
                  <td><div className="eau-user-cell"><div className="eau-avatar" aria-hidden="true">{avatarLetters(account.email)}</div><div className="eau-user-meta">
                    <strong title={account.email ?? undefined}>{account.email || "Chưa có email"}</strong>
                    <span className="eau-user-sub"><span>ID: {account.id.slice(0, 8)}…</span>{self && <span className="eau-self-label">Tài khoản của bạn</span>}</span>
                  </div></div></td>
                  <td><span className={`eau-role ${account.role === "Admin" ? "eau-role--admin" : ""}`}>{account.role === "Admin" ? "✦ Admin" : "Học viên"}</span></td>
                  <td><AccountBadge account={account} /></td>
                  <td><span className={account.emailConfirmed ? "eau-verified" : "eau-unverified"}>{account.emailConfirmed ? "✓ Đã xác minh" : "○ Chưa xác minh"}</span></td>
                  <td><div className="eau-row-actions">
                    <button type="button" className="eau-action eau-action-detail" onClick={(e) => openDialog({ kind: "details", account }, e.currentTarget)} disabled={!!busyId}>Chi tiết</button>
                    <button type="button" className="eau-action" onClick={(e) => openDialog({ kind: "role", account, role: account.role === "Admin" ? "Student" : "Admin" }, e.currentTarget)} disabled={!canPromote} title={self ? "Không thể đổi quyền chính mình" : account.suspended ? "Hãy mở khóa trước khi cấp quyền Admin" : undefined}>{account.role === "Admin" ? "Hạ quyền" : "Cấp Admin"}</button>
                    <button type="button" className={`eau-action ${account.suspended ? "" : "eau-action-danger"}`} onClick={(e) => openDialog({ kind: "status", account, suspended: !account.suspended }, e.currentTarget)} disabled={!canLock} title={account.role === "Admin" ? "Không hỗ trợ khóa Admin" : self ? "Không thể tự khóa mình" : undefined}>{account.suspended ? "Mở khóa" : "Khóa"}</button>
                  </div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </>}

        {data && data.total > 0 && <div className="eau-pagination">
          <span>Trang <strong>{shownPage}</strong> / {totalPages} · {data.total.toLocaleString("vi-VN")} kết quả {appliedSearch && `cho “${appliedSearch}”`}</span>
          <div><button type="button" onClick={() => changePage(page - 1)} disabled={loading || !!busyId || page <= 1}>← Trang trước</button>
            <button type="button" onClick={() => changePage(page + 1)} disabled={loading || !!busyId || page >= totalPages}>Trang sau →</button></div>
        </div>}
        {hasLocalFilter && <p className="eau-filter-warning">Lưu ý: Vai trò và Trạng thái được lọc trên 15 tài khoản/trang do API hiện chưa cung cấp bộ lọc toàn hệ thống. Hãy chuyển trang để kiểm tra các tài khoản khác.</p>}
      </section>

      <aside className="eau-security-note"><span aria-hidden="true">ⓘ</span><div><strong>Quản lý tài khoản an toàn</strong><p>Không thể tự hạ quyền hoặc tự khóa tài khoản đang đăng nhập. Admin không thể bị khóa tại màn hình này; quyền Admin cuối cùng được bảo vệ bởi API. Trang này chưa hỗ trợ xóa tài khoản, tạo tài khoản hay đặt lại mật khẩu cho người khác.</p></div></aside>

      {dialog && <div className="eau-modal-root">
        <button type="button" className="eau-modal-backdrop" aria-label="Đóng cửa sổ" onClick={closeDialog} disabled={!!busyId} />
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="eau-modal-title" aria-describedby="eau-modal-description" className="eau-modal">
          <div className="eau-modal-top"><span className="eau-modal-icon" aria-hidden="true">{dialog.kind === "details" ? "▤" : dialog.kind === "role" ? "✦" : "⊘"}</span><button type="button" onClick={closeDialog} disabled={!!busyId} aria-label="Đóng cửa sổ" ref={modalCloseRef}>×</button></div>
          <h2 id="eau-modal-title">{dialog.kind === "details" ? "Thông tin tài khoản" : dialog.kind === "role" ? "Xác nhận thay đổi quyền" : dialog.suspended ? "Xác nhận khóa tài khoản" : "Xác nhận mở khóa tài khoản"}</h2>
          <p id="eau-modal-description">{dialog.kind === "details" ? "Thông tin lấy từ API quản trị, không chứa dữ liệu riêng tư." : "Thao tác này ảnh hưởng đến quyền sử dụng EduMindAI. Hãy kiểm tra đúng tài khoản trước khi xác nhận."}</p>
          <dl className="eau-modal-facts">
            <div><dt>Email</dt><dd>{dialog.account.email || "Chưa có email"}</dd></div>
            <div><dt>Mã tài khoản</dt><dd className="eau-break-id">{dialog.account.id}</dd></div>
            <div><dt>Vai trò hiện tại</dt><dd>{dialog.account.role === "Admin" ? "Quản trị viên" : "Học viên"}</dd></div>
            <div><dt>Trạng thái hiện tại</dt><dd>{dialog.account.suspended ? "Đang khóa" : "Hoạt động"}</dd></div>
            {dialog.kind === "details" && <><div><dt>Xác minh email</dt><dd>{dialog.account.emailConfirmed ? "Đã xác minh" : "Chưa xác minh"}</dd></div><div><dt>Số lần đăng nhập lỗi</dt><dd>{dialog.account.accessFailedCount}</dd></div></>}
            {dialog.kind === "role" && <div className="eau-modal-highlight"><dt>Vai trò sau khi thay đổi</dt><dd>{dialog.role === "Admin" ? "Quản trị viên — quyền quản lý" : "Học viên — quyền học tập"}</dd></div>}
            {dialog.kind === "status" && <div className="eau-modal-highlight"><dt>Trạng thái sau khi thay đổi</dt><dd>{dialog.suspended ? "Khóa tài khoản" : "Mở khóa tài khoản"}</dd></div>}
          </dl>
          {dialog.kind === "role" && dialog.role === "Admin" && <p className="eau-modal-warning">Cấp quyền Admin cho phép tài khoản này truy cập API và khu vực quản trị. Chỉ thực hiện với người được ủy quyền.</p>}
          {dialogNotice && <p className="eau-modal-copy-notice" role="status">{dialogNotice}</p>}
          {error && <p className="eau-modal-error" role="alert">{error}</p>}
          <div className="eau-modal-actions">
            {dialog.kind === "details" && <button type="button" className="eau-btn eau-btn-neutral" onClick={() => void copyId(dialog.account.id)}>▢ Sao chép ID</button>}
            <button type="button" className="eau-btn eau-btn-neutral" onClick={closeDialog} disabled={!!busyId}>{dialog.kind === "details" ? "Đóng" : "Hủy"}</button>
            {dialog.kind !== "details" && <button type="button" ref={primaryRef} onClick={() => void confirmChange()} className={`eau-btn ${dialog.kind === "status" && dialog.suspended ? "eau-btn-danger" : "eau-btn-primary"}`} disabled={!!busyId}>{busyId ? "Đang cập nhật..." : "Xác nhận thay đổi"}</button>}
          </div>
        </div>
      </div>}
    </div>
  );
}
