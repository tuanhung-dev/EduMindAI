import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getAdminDashboard, type AdminDashboard } from "../services/adminService";
import {
  getDocuments, getDocumentTextPreview, isWordDocument,
  type DocumentItem, type DocumentTextPreview,
} from "../services/documentService";
import { getSubjects, type Subject } from "../services/subjectService";
import { apiErrorMessage } from "../services/apiClient";
import "./AdminDocumentsPage.css";

type StatusFilter = "all" | "ready" | "processing" | "failed" | "uploaded" | "other";
type TypeFilter = "all" | "pdf" | "docx";
type SortOrder = "newest" | "oldest" | "name" | "size";
type ViewMode = "table" | "cards";

const PAGE_SIZE = 12;
const collator = new Intl.Collator("vi", { sensitivity: "base", numeric: true });

function simplify(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

function statusGroup(status: string): Exclude<StatusFilter, "all"> {
  const normalized = status.toLowerCase();
  if (normalized === "ready") return "ready";
  if (["queued", "processing"].includes(normalized)) return "processing";
  if (["failed", "error"].includes(normalized)) return "failed";
  if (normalized === "uploaded") return "uploaded";
  return "other";
}

const statusDescriptions: Record<Exclude<StatusFilter, "all">, string> = {
  ready: "Sẵn sàng", processing: "Đang xử lý", failed: "Lỗi xử lý",
  uploaded: "Chưa lập chỉ mục", other: "Khác",
};

function friendlyStatus(status: string) {
  const category = statusGroup(status);
  return { category, label: statusDescriptions[category], raw: status };
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Không rõ";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Không rõ" : date.toLocaleString("vi-VN");
}

function isoTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

// Bảo vệ file CSV khỏi công thức bảng tính nằm trong tên tài liệu do người dùng đặt.
function csvCell(value: unknown): string {
  let text = String(value ?? "");
  let first = 0;
  while (first < text.length && text.charCodeAt(first) <= 32) first++;
  if (["=", "+", "-", "@"].includes(text[first] ?? "")) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function StatusPill({ status }: { status: string }) {
  const { category, label } = friendlyStatus(status);
  return <span className={`adm4-status adm4-status--${category}`} title={`Trạng thái API: ${status}`}>
    <span aria-hidden="true" />{label}
  </span>;
}

export default function AdminDocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [warning, setWarning] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [subjectId, setSubjectId] = useState("all");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [view, setView] = useState<ViewMode>("table");
  const [page, setPage] = useState(1);

  const [openedId, setOpenedId] = useState<number | null>(null);
  const [textPreview, setTextPreview] = useState<DocumentTextPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Các lời gọi độc lập: lỗi thống kê hoặc môn học không làm mất danh sách tài liệu.
  useEffect(() => {
    let active = true;
    const run = async () => {
      const [docsResult, subjectsResult, dashboardResult] = await Promise.allSettled([
        getDocuments(), getSubjects(), getAdminDashboard(),
      ]);
      if (!active) return;
      if (docsResult.status === "fulfilled") {
        setDocuments(docsResult.value);
        setFailure("");
      } else {
        setFailure(apiErrorMessage(docsResult.reason, "Không tải được danh sách tài liệu."));
      }
      if (subjectsResult.status === "fulfilled") setSubjects(subjectsResult.value);
      if (dashboardResult.status === "fulfilled") setDashboard(dashboardResult.value);
      const issues = [
        subjectsResult.status === "rejected" ? "Không tải được tên môn học." : "",
        dashboardResult.status === "rejected" ? "Không tải được tổng hợp hệ thống." : "",
      ].filter(Boolean);
      setWarning(issues.join(" "));
      setLoading(false);
    };
    void run();
    return () => { active = false; };
  }, [refreshKey]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setRefreshKey(value => value + 1);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [autoRefresh]);

  const subjectMap = useMemo(() => new Map(subjects.map(s => [s.id, s])), [subjects]);
  const counts = useMemo(() => {
    const current = { ready: 0, processing: 0, failed: 0, uploaded: 0, other: 0 };
    for (const document of documents) current[statusGroup(document.status)]++;
    return current;
  }, [documents]);
  const totalSize = useMemo(() => documents.reduce((sum, item) => sum + item.sizeBytes, 0), [documents]);

  const visible = useMemo(() => {
    const needle = simplify(query.trim());
    return documents.filter(item => {
      const subject = subjectMap.get(item.subjectId);
      const haystack = simplify(`${item.id} ${item.originalFileName} ${subject?.code ?? ""} ${subject?.name ?? ""}`);
      if (needle && !haystack.includes(needle)) return false;
      if (status !== "all" && statusGroup(item.status) !== status) return false;
      if (typeFilter !== "all" && (isWordDocument(item) ? "docx" : "pdf") !== typeFilter) return false;
      if (subjectId !== "all" && item.subjectId !== Number(subjectId)) return false;
      return true;
    }).sort((a, b) => {
      if (sort === "oldest") return isoTime(a.createdAtUtc) - isoTime(b.createdAtUtc) || a.id - b.id;
      if (sort === "name") return collator.compare(a.originalFileName, b.originalFileName) || a.id - b.id;
      if (sort === "size") return b.sizeBytes - a.sizeBytes || b.id - a.id;
      return isoTime(b.createdAtUtc) - isoTime(a.createdAtUtc) || b.id - a.id;
    });
  }, [documents, subjectMap, query, status, typeFilter, subjectId, sort]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageItems = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected = documents.find(item => item.id === openedId) ?? null;
  const documentsInSummary = dashboard?.summary.documents;
  const orphanCount = dashboard?.summary.orphanDocuments;

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(draftQuery);
    setPage(1);
  }

  function clearFilters() {
    setDraftQuery(""); setQuery(""); setStatus("all");
    setTypeFilter("all"); setSubjectId("all"); setSort("newest"); setPage(1);
  }

  function reload() {
    setLoading(true);
    setRefreshKey(n => n + 1);
  }

  function openDetails(item: DocumentItem, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setOpenedId(item.id); setTextPreview(null); setPreviewError("");
    setPreviewLoading(false); setCopyNotice("");
  }

  function closeDetails() {
    setOpenedId(null);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (openedId === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpenedId(null); triggerRef.current?.focus(); }
      if (event.key !== "Tab") return;
      const modal = closeButtonRef.current?.closest("[role=dialog]");
      if (!modal) return;
      const items = Array.from(modal.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])'
      )).filter(el => el.getClientRects().length > 0);
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault(); items[items.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
        event.preventDefault(); items[0].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKey); };
  }, [openedId]);

  // Hủy lời gọi khi đóng/chuyển sang tài liệu khác để tránh hiện sai nội dung.
  useEffect(() => {
    if (openedId === null || !previewLoading) return;
    const controller = new AbortController();
    const run = async () => {
      try {
        const preview = await getDocumentTextPreview(openedId, controller.signal);
        if (!controller.signal.aborted) { setTextPreview(preview); setPreviewError(""); }
      } catch (reason) {
        if (!controller.signal.aborted) setPreviewError(apiErrorMessage(reason, "Không đọc được văn bản trích xuất."));
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [openedId, previewLoading]);

  function exportCsv() {
    const header = ["ID", "Tên file", "Mã môn", "Môn học", "Định dạng", "Dung lượng (bytes)", "Trạng thái", "Ngày tải (UTC)"];
    const rows = visible.map(item => {
      const subject = subjectMap.get(item.subjectId);
      return [item.id, item.originalFileName, subject?.code ?? item.subjectId,
        subject?.name ?? "Không rõ", isWordDocument(item) ? "DOCX" : "PDF",
        item.sizeBytes, item.status, item.createdAtUtc];
    });
    const content = "\uFEFF" + [header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `EduMindAI-Admin-TaiLieu-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyId(id: number) {
    try { await navigator.clipboard.writeText(String(id)); setCopyNotice("Đã sao chép ID tài liệu."); }
    catch { setCopyNotice("Không thể sao chép tự động. Hãy sao chép ID thủ công."); }
  }


  return <div className="adm4-page">
    <header className="adm4-hero">
      <div className="adm4-hero-copy">
        <span className="adm4-eyebrow">EDUMIND AI · QUẢN TRỊ HỌC LIỆU</span>
        <h1>Quản lý tài liệu <em>toàn hệ thống</em></h1>
        <p>Giám sát file Word/PDF của học viên, theo dõi tiến trình xử lý và tra cứu học liệu trong một nơi.</p>
        <div className="adm4-hero-actions">
          <a className="adm4-btn adm4-btn-white" href="#adm4-library">Xem danh sách tài liệu ↓</a>
          <Link className="adm4-btn adm4-btn-outline-light" to="/app/admin">← Dashboard Admin</Link>
        </div>
      </div>
      <div className="adm4-hero-decoration" aria-hidden="true"><span>▤</span><strong>ADMIN / DOCUMENTS</strong><small>Giám sát · Tra cứu · Báo cáo</small></div>
    </header>

    <section className="adm4-stats" aria-label="Thống kê tài liệu">
      <div className="adm4-stat"><span>▤</span><div><small>Đang hiển thị cho Admin</small><strong>{loading && !documents.length ? "…" : failure ? "—" : documents.length}</strong><small>{formatBytes(totalSize)} dữ liệu file</small></div></div>
      <div className="adm4-stat"><span>✓</span><div><small>Đã sẵn sàng</small><strong>{failure ? "—" : counts.ready}</strong><small>Có thể tra cứu nội dung</small></div></div>
      <div className="adm4-stat"><span>◷</span><div><small>Đang chờ / xử lý</small><strong>{failure ? "—" : counts.processing}</strong><small>Queued và Processing</small></div></div>
      <div className="adm4-stat"><span>!</span><div><small>Lỗi xử lý</small><strong>{failure ? "—" : counts.failed}</strong><small>Cần học viên kiểm tra</small></div></div>
    </section>

    <section className="adm4-overview" aria-label="Giám sát hệ thống">
      <div className="adm4-distribution">
        <div className="adm4-section-head"><div><span className="adm4-kicker">CHẤT LƯỢNG HỌC LIỆU</span><h2>Phân bố trạng thái</h2></div></div>
        {documents.length > 0 && !failure ? <>
          <div className="adm4-bar" aria-label="Tỉ trọng trạng thái">
            {(["ready", "processing", "failed", "uploaded", "other"] as const).map(s =>
              <span key={s} className={`adm4-bar-${s}`} title={`${statusDescriptions[s]}: ${counts[s]}`}
                style={{ width: `${counts[s] / documents.length * 100}%` }} />)}
          </div>
          <div className="adm4-legend">{(["ready", "processing", "failed", "uploaded", "other"] as const).map(s =>
            <span key={s}><i className={`adm4-dot-${s}`} />{statusDescriptions[s]}: <b>{counts[s]}</b></span>)}</div>
        </> : <p className="adm4-muted">Chưa có dữ liệu để tính phân bố.</p>}
      </div>
      <div className="adm4-coverage">
        <span className="adm4-kicker">DỮ LIỆU HỆ THỐNG</span>
        <h2>Phạm vi quản trị</h2>
        <p>API danh sách trả về tài liệu <strong>đã gắn chủ sở hữu</strong> cho Admin. Tài liệu cũ thiếu chủ sở hữu không có trong danh sách này.</p>
        <div className="adm4-coverage-stats">
          <span>Tổng ghi nhận DB: <strong>{documentsInSummary ?? "—"}</strong></span>
          <span>Chưa gắn chủ sở hữu: <strong>{orphanCount ?? "—"}</strong></span>
        </div>
      </div>
    </section>

    <section id="adm4-library" className="adm4-library" aria-labelledby="adm4-library-title">
      <div className="adm4-section-head">
        <div><span className="adm4-kicker">DANH MỤC TÀI LIỆU</span><h2 id="adm4-library-title">Tra cứu học liệu</h2>
          <p>Tìm theo tên, ID hoặc môn học, kiểm tra trạng thái và xem phần nội dung được phép truy cập.</p></div>
        <div className="adm4-head-actions">
          <label className="adm4-auto"><input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)} />Tự làm mới 15 giây</label>
          <button type="button" className="adm4-btn adm4-btn-secondary" onClick={reload} disabled={loading}>↻ {loading ? "Đang tải" : "Làm mới"}</button>
          <button type="button" className="adm4-btn adm4-btn-primary" onClick={exportCsv} disabled={!!failure || visible.length === 0}>↓ Xuất CSV ({visible.length})</button>
        </div>
      </div>

      <form className="adm4-toolbar" onSubmit={submitSearch}>
        <div className="adm4-search"><label htmlFor="adm4-query">Tìm kiếm</label><div className="adm4-input-wrap"><span aria-hidden="true">⌕</span>
          <input id="adm4-query" value={draftQuery} onChange={event => setDraftQuery(event.target.value)}
            placeholder="Tên tài liệu, mã môn, ID..." maxLength={150} />
          {draftQuery && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => { setDraftQuery(""); setQuery(""); setPage(1); }}>×</button>}
        </div></div>
        <button type="submit" className="adm4-btn adm4-btn-primary adm4-search-button">Tìm</button>
        <div><label htmlFor="adm4-subject">Môn học</label><select id="adm4-subject" value={subjectId} onChange={event => { setSubjectId(event.target.value); setPage(1); }}>
          <option value="all">Tất cả môn học</option>
          {subjects.map(item => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}
        </select></div>
        <div><label htmlFor="adm4-status">Trạng thái</label><select id="adm4-status" value={status} onChange={event => { setStatus(event.target.value as StatusFilter); setPage(1); }}>
          <option value="all">Tất cả trạng thái</option>
          <option value="ready">Sẵn sàng</option><option value="processing">Đang xử lý</option>
          <option value="failed">Lỗi xử lý</option><option value="uploaded">Chưa lập chỉ mục</option><option value="other">Khác</option>
        </select></div>
        <div><label htmlFor="adm4-type">Định dạng</label><select id="adm4-type" value={typeFilter} onChange={event => { setTypeFilter(event.target.value as TypeFilter); setPage(1); }}>
          <option value="all">PDF và DOCX</option><option value="pdf">Chỉ PDF</option><option value="docx">Chỉ DOCX</option>
        </select></div>
      </form>
      <div className="adm4-tools-secondary">
        <div className="adm4-segmented" role="group" aria-label="Kiểu xem">
          <button type="button" aria-pressed={view === "table"} className={view === "table" ? "active" : ""} onClick={() => setView("table")}>☷ Bảng</button>
          <button type="button" aria-pressed={view === "cards"} className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}>▦ Thẻ</button>
        </div>
        <div className="adm4-sort"><label htmlFor="adm4-sort">Sắp xếp:</label><select id="adm4-sort" value={sort} onChange={event => { setSort(event.target.value as SortOrder); setPage(1); }}>
          <option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="name">Tên A–Z</option><option value="size">Dung lượng lớn</option>
        </select></div>
        <button type="button" className="adm4-clear" onClick={clearFilters}>Xóa bộ lọc</button>
      </div>

      {failure && <div className="adm4-alert adm4-alert-error" role="alert"><strong>Không thể cập nhật danh sách.</strong> {failure}
        <button type="button" onClick={reload}>Thử lại</button></div>}
      {warning && <div className="adm4-alert adm4-alert-warning" role="status">{warning}</div>}
      <div className="adm4-results" role="status">
        <span>{loading ? "Đang cập nhật..." : failure ? "Không có dữ liệu mới" : <>Hiển thị <strong>{visible.length}</strong> / {documents.length} tài liệu · {formatBytes(visible.reduce((n, item) => n + item.sizeBytes, 0))}</>}</span>
        <small>Phân trang, tìm kiếm và lọc trên danh sách API đã tải</small>
      </div>
      {loading && !documents.length ? <div className="adm4-empty" role="status"><span className="adm4-spinner" />Đang tải tài liệu hệ thống...</div>
        : !failure && documents.length === 0 ? <div className="adm4-empty"><strong>Chưa có tài liệu thuộc phạm vi danh sách.</strong><p>Kiểm tra dữ liệu ở Dashboard Admin.</p></div>
        : !failure && visible.length === 0 ? <div className="adm4-empty"><strong>Không tìm thấy tài liệu phù hợp.</strong><p>Hãy thử bộ lọc khác.</p><button type="button" onClick={clearFilters}>Xóa bộ lọc</button></div>
        : failure ? null : view === "table" ? (
          <div className="adm4-table-scroll"><table className="adm4-table"><thead><tr><th>Tài liệu</th><th>Môn học</th><th>Trạng thái</th><th>Ngày tải</th><th>Thao tác</th></tr></thead>
            <tbody>{pageItems.map(item => <tr key={item.id}>
              <td><div className="adm4-file-cell"><span className={`adm4-file-icon ${isWordDocument(item) ? "adm4-word" : ""}`} aria-hidden="true">{isWordDocument(item) ? "W" : "PDF"}</span>
                <div className="adm4-file-name"><strong title={item.originalFileName}>{item.originalFileName}</strong><small>#{item.id} · {formatBytes(item.sizeBytes)}</small></div></div></td>
              <td><span className="adm4-subject">{subjectMap.get(item.subjectId)?.name ?? `Môn #${item.subjectId}`}</span></td>
              <td><StatusPill status={item.status} /></td><td><span className="adm4-date">{formatDate(item.createdAtUtc)}</span></td>
              <td><button type="button" className="adm4-row-button" onClick={event => openDetails(item, event.currentTarget)}>Xem chi tiết ↗</button></td>
            </tr>)}</tbody></table></div>
        ) : <div className="adm4-card-grid">{pageItems.map(item => <article className="adm4-doc-card" key={item.id}>
          <div className="adm4-card-head"><span className={`adm4-file-icon ${isWordDocument(item) ? "adm4-word" : ""}`} aria-hidden="true">{isWordDocument(item) ? "W" : "PDF"}</span><StatusPill status={item.status}/></div>
          <h3 title={item.originalFileName}>{item.originalFileName}</h3>
          <p>Môn: {subjectMap.get(item.subjectId)?.name ?? `#${item.subjectId}`}</p>
          <div className="adm4-card-footer"><small>#{item.id} · {formatBytes(item.sizeBytes)}<br />{formatDate(item.createdAtUtc)}</small>
            <button type="button" onClick={event => openDetails(item, event.currentTarget)}>Chi tiết ↗</button></div>
        </article>)}</div>}

      {!failure && visible.length > PAGE_SIZE && <nav className="adm4-pager" aria-label="Phân trang tài liệu">
        <span>Trang <strong>{Math.min(page, pageCount)}</strong> / {pageCount}</span>
        <div><button type="button" disabled={page <= 1} onClick={() => setPage(n => Math.max(1, n - 1))}>← Trước</button>
          <button type="button" disabled={page >= pageCount} onClick={() => setPage(n => Math.min(pageCount, n + 1))}>Sau →</button></div>
      </nav>}
    </section>

    <section className="adm4-policy" aria-labelledby="adm4-policy-title">
      <span className="adm4-policy-icon" aria-hidden="true">ⓘ</span><div>
        <h2 id="adm4-policy-title">Phạm vi quyền Admin hiện tại</h2>
        <p>Danh sách API chưa trả về ID/email chủ tài liệu. Chưa có API Admin để đổi chủ sở hữu, xóa hoặc lập chỉ mục tài liệu của học viên; vì vậy trang này chỉ cung cấp thao tác xem, tra cứu và xuất metadata. Việc xem file gốc/văn bản có thể chứa dữ liệu học viên; chỉ sử dụng cho mục đích quản trị được phép.</p>
      </div>
    </section>

    {selected && <div className="adm4-modal-root">
      <button type="button" className="adm4-modal-backdrop" aria-label="Đóng chi tiết tài liệu" onClick={closeDetails} />
      <section className="adm4-detail" role="dialog" aria-modal="true" aria-labelledby="adm4-dialog-title">
        <header className="adm4-detail-head"><div><span className="adm4-kicker">HỒ SƠ TÀI LIỆU · #{selected.id}</span>
          <h2 id="adm4-dialog-title">Chi tiết tài liệu</h2></div>
          <button type="button" ref={closeButtonRef} className="adm4-detail-close" onClick={closeDetails} aria-label="Đóng chi tiết">×</button>
        </header>
        <div className="adm4-detail-file"><span className={`adm4-file-icon ${isWordDocument(selected) ? "adm4-word" : ""}`} aria-hidden="true">{isWordDocument(selected) ? "W" : "PDF"}</span>
          <div><strong>{selected.originalFileName}</strong><StatusPill status={selected.status}/></div></div>
        <dl className="adm4-detail-facts">
          <div><dt>ID tài liệu</dt><dd><code>{selected.id}</code> <button type="button" onClick={() => void copyId(selected.id)}>Sao chép</button></dd></div>
          <div><dt>Môn học</dt><dd>{subjectMap.get(selected.subjectId)?.name ?? `Môn #${selected.subjectId}`}</dd></div>
          <div><dt>Loại file</dt><dd>{isWordDocument(selected) ? "Word (.docx)" : "PDF (.pdf)"}</dd></div>
          <div><dt>Dung lượng</dt><dd>{formatBytes(selected.sizeBytes)}</dd></div>
          <div><dt>Ngày tải</dt><dd>{formatDate(selected.createdAtUtc)}</dd></div>
          <div><dt>Trạng thái API</dt><dd>{selected.status}</dd></div>
          <div><dt>Chủ sở hữu</dt><dd>API chưa cung cấp</dd></div>
        </dl>
        {copyNotice && <p role="status" className="adm4-copy-status">{copyNotice}</p>}
        <div className="adm4-detail-actions">
          <Link to={`/app/pdf/${selected.id}`} target="_blank" rel="noopener noreferrer" className="adm4-btn adm4-btn-primary">↗ Mở file gốc</Link>
          <button type="button" className="adm4-btn adm4-btn-secondary" disabled={previewLoading} onClick={() => { setTextPreview(null); setPreviewError(""); setPreviewLoading(true); }}>
            {previewLoading ? "Đang trích xuất..." : "▤ Xem văn bản trích xuất"}
          </button>
        </div>
        {previewError && <p className="adm4-alert adm4-alert-error" role="alert">{previewError}</p>}
        {previewLoading && <p role="status" className="adm4-muted">Đang tải bản xem trước...</p>}
        {textPreview && <div className="adm4-excerpts"><h3>Văn bản xem trước</h3>
          <p>API chỉ trả tối đa 5 phần đầu, mỗi phần tối đa 5.000 ký tự, không phải toàn bộ tài liệu.</p>
          {textPreview.pages.some(part => part.text.trim()) ? textPreview.pages.filter(part => part.text.trim()).map(part =>
            <details key={part.pageNumber}><summary>{textPreview.unit === "section" ? "Phần" : "Trang"} {part.pageNumber}</summary><pre>{part.text}</pre></details>)
            : <p>Chưa trích xuất được văn bản từ phần xem trước.</p>}
        </div>}
        <p className="adm4-detail-note">Admin hiện không được lập chỉ mục, xóa hay sửa tài liệu của tài khoản khác qua các API này.</p>
      </section>
    </div>}
  </div>;
}
