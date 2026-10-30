import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  deleteUnusedAdminQuiz, getAdminAttempt, getAdminQuiz, getExamsOverview,
  listAdminAttempts, listAdminQuizzes,
  type AdminAttempt, type AdminAttemptDetail, type AdminQuiz, type AdminQuizDetail,
  type ExamDifficulty, type ExamsOverview, type PagedResponse,
} from "../services/adminExamsService";
import { apiErrorMessage } from "../services/apiClient";
import "./AdminExamsPage.css";

type Tab = "quizzes" | "attempts";
type Detail = { kind: "quiz"; value: AdminQuizDetail } | { kind: "attempt"; value: AdminAttemptDetail };
const PAGE_SIZE = 15;
const number = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value) : "—";
const when = (value: string | null | undefined) => {
  if (!value) return "Chưa có";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Không rõ" : date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
};
const difficultyName = (value: string) => ({ easy: "Dễ", medium: "Trung bình", hard: "Khó" }[value] ?? value);
const identity = (email: string | null, id: string | null) => email || (id ? `ID: ${id}` : "Dữ liệu cũ chưa gắn chủ");
const cleanId = (value: string) => /^\d+$/.test(value.trim()) && Number(value) > 0 ? value.trim() : "";

function csvField(value: unknown): string {
  let text = String(value ?? "");
  const first = text.trimStart()[0] ?? "";
  if (["=", "+", "-", "@"].includes(first)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
function exportCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = "\uFEFF" + rows.map(row => row.map(csvField).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AdminExamsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "attempts" ? "attempts" : "quizzes";
  const [overview, setOverview] = useState<ExamsOverview | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [refreshId, setRefreshId] = useState(0);
  const [data, setData] = useState<PagedResponse<AdminQuiz> | PagedResponse<AdminAttempt> | null>(null);
  const [dataError, setDataError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<"all" | ExamDifficulty>("all");
  const [attemptState, setAttemptState] = useState<"all" | "submitted" | "open">("all");
  const [documentIdDraft, setDocumentIdDraft] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [quizIdDraft, setQuizIdDraft] = useState("");
  const [quizId, setQuizId] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminQuiz | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const detailRequestRef = useRef(0);

  const switchTab = (next: Tab) => {
    setParams(next === "attempts" ? { tab: "attempts" } : {});
    setPage(1); setSearch(""); setDraft("");
    setDetail(null); setDetailError(""); setNotice(""); setFilterError("");
  };

  useEffect(() => {
    const ctl = new AbortController();
    void Promise.resolve().then(() => {
      if (!ctl.signal.aborted) { setOverviewLoading(true); setOverviewError(""); }
    });
    getExamsOverview(ctl.signal)
      .then(value => setOverview(value))
      .catch(error => { if (!ctl.signal.aborted) setOverviewError(apiErrorMessage(error)); })
      .finally(() => { if (!ctl.signal.aborted) setOverviewLoading(false); });
    return () => ctl.abort();
  }, [refreshId]);

  useEffect(() => {
    const ctl = new AbortController();
    void Promise.resolve().then(() => {
      if (!ctl.signal.aborted) { setLoading(true); setDataError(""); setData(null); }
    });
    const promise = tab === "quizzes"
      ? listAdminQuizzes({ search, difficulty, documentId, page }, ctl.signal)
      : listAdminAttempts({ search, state: attemptState, quizId, page }, ctl.signal);
    promise.then(result => { if (!ctl.signal.aborted) setData(result); })
      .catch(error => { if (!ctl.signal.aborted) setDataError(apiErrorMessage(error)); })
      .finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    return () => ctl.abort();
  }, [tab, search, difficulty, documentId, attemptState, quizId, page, refreshId]);

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const typedId = tab === "quizzes" ? documentIdDraft : quizIdDraft;
    if (typedId.trim() && !cleanId(typedId)) {
      setFilterError("ID phải là số nguyên dương.");
      return;
    }
    setFilterError("");
    setSearch(draft.trim());
    if (tab === "quizzes") setDocumentId(cleanId(documentIdDraft));
    else setQuizId(cleanId(quizIdDraft));
    setPage(1);
  };

  const clearFilters = () => {
    setDraft(""); setSearch(""); setDocumentIdDraft(""); setDocumentId("");
    setQuizIdDraft(""); setQuizId(""); setDifficulty("all"); setAttemptState("all");
    setFilterError(""); setPage(1);
  };

  const openDetail = useCallback(async (kind: "quiz" | "attempt", id: number) => {
    const requestId = ++detailRequestRef.current;
    setDetail(null); setDetailError(""); setDetailLoading(true);
    try {
      if (kind === "quiz") {
        const value = await getAdminQuiz(id);
        if (detailRequestRef.current === requestId) setDetail({ kind, value });
      } else {
        const value = await getAdminAttempt(id);
        if (detailRequestRef.current === requestId) setDetail({ kind, value });
      }
    } catch (error) {
      if (detailRequestRef.current === requestId) setDetailError(apiErrorMessage(error));
    } finally {
      if (detailRequestRef.current === requestId) setDetailLoading(false);
    }
  }, []);

  const closeModal = () => {
    if (deleteBusy) return;
    detailRequestRef.current++;
    setDetail(null); setDetailLoading(false); setDeleteTarget(null);
    setDetailError(""); setDeleteConfirm("");
  };
  useEffect(() => {
    if (!detail && !detailLoading && !detailError && !deleteTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleteBusy) closeModal();
    };
    document.addEventListener("keydown", onKeyDown);
    modalCloseRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, detailLoading, detailError, deleteTarget, deleteBusy]);

  const confirmDelete = async () => {
    if (!deleteTarget || deleteConfirm.trim() !== `XOA ${deleteTarget.id}` || deleteBusy) return;
    setDeleteBusy(true); setDetailError("");
    try {
      const response = await deleteUnusedAdminQuiz(deleteTarget.id);
      setNotice(response.message);
      setDeleteTarget(null); setDeleteConfirm("");
      setRefreshId(id => id + 1);
    } catch (error) { setDetailError(apiErrorMessage(error)); }
    finally { setDeleteBusy(false); }
  };

  const quizPage = tab === "quizzes" ? data as PagedResponse<AdminQuiz> | null : null;
  const attemptPage = tab === "attempts" ? data as PagedResponse<AdminAttempt> | null : null;
  const lastPage = Math.max(1, data?.totalPages ?? 1);
  const maxBar = Math.max(1, ...(overview?.recentActivity.map(item => item.completedAttempts) ?? [1]));
  const metrics = useMemo(() => [
    { label: "Đề thi", value: overview?.totalQuizzes, icon: "◈" },
    { label: "Lượt làm", value: overview?.totalAttempts, icon: "◎" },
    { label: "Đã nộp", value: overview?.completedAttempts, icon: "✓" },
    { label: "Điểm trung bình", value: overview?.averageScore, suffix: "%", icon: "↗" },
    { label: "Chưa nộp", value: overview?.openAttempts, icon: "◷" },
    { label: "Bài dưới 50%", value: overview?.lowScoreAttempts, icon: "!" },
    { label: "Đề dùng nguồn một phần", value: overview?.partialQuizzes, icon: "▧" },
  ], [overview]);

  function downloadCsv() {
    if (tab === "quizzes" && quizPage?.items.length) {
      exportCsv("admin05_de_thi_trang_hien_tai.csv", [
        ["ID", "Tên đề", "Tài liệu", "Độ khó", "Số câu", "Chủ tài khoản", "Lượt làm", "Đã nộp", "Ngày tạo"],
        ...quizPage.items.map(q => [q.id, q.title, q.documentName, difficultyName(q.difficulty), q.questionCount,
          identity(q.ownerEmail, q.ownerUserId), q.attemptCount, q.submittedCount, when(q.createdAtUtc)])
      ]);
    } else if (tab === "attempts" && attemptPage?.items.length) {
      exportCsv("admin05_ket_qua_trang_hien_tai.csv", [
        ["ID", "Mã đề", "Tên đề", "Học viên", "Ngày bắt đầu", "Ngày nộp", "Số câu đúng", "Tổng câu", "Điểm %"],
        ...attemptPage.items.map(a => [a.id, a.quizId, a.quizTitle, identity(a.ownerEmail, a.ownerUserId),
          when(a.startedAtUtc), when(a.submittedAtUtc), a.correctCount, a.totalQuestions, a.scorePercent])
      ]);
    }
  }

  return <div className="adm5-page" id="adm5-top">
    <nav className="adm5-crumb" aria-label="Đường dẫn"><Link to="/app/admin">Admin</Link><span>/</span><strong>Đề thi & kết quả</strong></nav>
    <header className="adm5-hero">
      <div>
        <p className="adm5-kicker">EDUMIND AI · ADMIN-05</p>
        <h1>Quản lý đề thi & kết quả</h1>
        <p>Giám sát các đề luyện thi, lượt làm bài và kết quả của toàn hệ thống. Dữ liệu từ API quản trị riêng.</p>
      </div>
      <button type="button" className="adm5-btn adm5-btn-light" disabled={loading || overviewLoading}
        onClick={() => setRefreshId(id => id + 1)}>↻ Làm mới dữ liệu</button>
    </header>

    {notice && <div className="adm5-notice" role="status">✓ {notice}<button type="button" onClick={() => setNotice("")} aria-label="Đóng thông báo">×</button></div>}
    <section className="adm5-section" aria-labelledby="adm5-overview-title">
      <div className="adm5-section-head"><h2 id="adm5-overview-title">Tổng quan hệ thống</h2><span>Toàn bộ dữ liệu • Không dùng số liệu mẫu</span></div>
      {overviewError && <div className="adm5-alert" role="alert">{overviewError} <button type="button" onClick={() => setRefreshId(v => v + 1)}>Thử lại</button></div>}
      <div className="adm5-stats" aria-busy={overviewLoading}>
        {metrics.map(metric => <article className="adm5-stat" key={metric.label}>
          <span className="adm5-stat-icon" aria-hidden="true">{metric.icon}</span>
          <div><p>{metric.label}</p><strong>{overviewLoading ? "…" : overview ? `${number(metric.value)}${metric.suffix || ""}` : "—"}</strong></div>
        </article>)}
      </div>
    </section>

    {overview && <section className="adm5-trend" aria-labelledby="adm5-trend-title">
      <div className="adm5-trend-copy"><h2 id="adm5-trend-title">Hoạt động 7 ngày</h2><p>Lượt nộp bài theo ngày (UTC). Chỉ đếm các lượt đã nộp thành công.</p></div>
      <div className="adm5-bars" role="img" aria-label={`7 ngày gần đây: ${overview.recentActivity.map(d => `${d.date} có ${d.completedAttempts} lượt`).join('; ')}`}>
        {overview.recentActivity.map(item => <div className="adm5-bar" key={item.date}>
          <strong>{item.completedAttempts}</strong><div className="adm5-bar-track"><div className="adm5-bar-fill" style={{ height: `${item.completedAttempts ? Math.max(7, item.completedAttempts / maxBar * 100) : 0}%` }} /></div>
          <small>{item.date.slice(5)}</small>
        </div>)}
      </div>
    </section>}

    <section className="adm5-workspace" aria-labelledby="adm5-list-title">
      <div className="adm5-workspace-head">
        <div><p className="adm5-kicker">DANH SÁCH QUẢN TRỊ</p><h2 id="adm5-list-title">Tra cứu và kiểm tra dữ liệu</h2>
          <p>Tìm kiếm và phân trang trên máy chủ. Có thể xem nội dung đề và các bài đã nộp.</p></div>
        <div className="adm5-tablist" role="tablist" aria-label="Chọn danh sách">
          <button role="tab" type="button" aria-selected={tab === "quizzes"} className={tab === "quizzes" ? "active" : ""} onClick={() => switchTab("quizzes")}>Ngân hàng đề thi</button>
          <button role="tab" type="button" aria-selected={tab === "attempts"} className={tab === "attempts" ? "active" : ""} onClick={() => switchTab("attempts")}>Lịch sử & kết quả</button>
        </div>
      </div>
      <form className="adm5-filters" onSubmit={submitFilters}>
        <label className="adm5-field adm5-field-search"><span>Tìm kiếm</span><input aria-label="Từ khóa tìm kiếm" value={draft} onChange={event => setDraft(event.target.value)} maxLength={120}
          placeholder={tab === "quizzes" ? "Tên đề hoặc tên tài liệu..." : "Tên đề hoặc email học viên..."}/></label>
        {tab === "quizzes" ? <>
          <label className="adm5-field"><span>Độ khó</span><select value={difficulty} onChange={event => { setDifficulty(event.target.value as "all" | ExamDifficulty); setPage(1); }}><option value="all">Tất cả</option><option value="easy">Dễ</option><option value="medium">Trung bình</option><option value="hard">Khó</option></select></label>
          <label className="adm5-field adm5-field-small"><span>ID tài liệu</span><input value={documentIdDraft} onChange={e => setDocumentIdDraft(e.target.value)} inputMode="numeric" placeholder="Tất cả" /></label>
        </> : <>
          <label className="adm5-field"><span>Trạng thái</span><select value={attemptState} onChange={event => { setAttemptState(event.target.value as "all" | "submitted" | "open"); setPage(1); }}><option value="all">Tất cả</option><option value="submitted">Đã nộp</option><option value="open">Chưa nộp</option></select></label>
          <label className="adm5-field adm5-field-small"><span>ID đề thi</span><input value={quizIdDraft} onChange={e => setQuizIdDraft(e.target.value)} inputMode="numeric" placeholder="Tất cả" /></label>
        </>}
        <button type="submit" className="adm5-btn adm5-btn-primary">Tìm kiếm</button>
        <button type="button" className="adm5-btn adm5-btn-subtle" onClick={clearFilters}>Xóa bộ lọc</button>
        <button type="button" className="adm5-btn adm5-btn-subtle" disabled={!data?.items.length} onClick={downloadCsv}>↓ Xuất CSV</button>
      </form>
      {filterError && <p className="adm5-alert" role="alert">{filterError}</p>}
      <p className="adm5-export-note">Báo cáo CSV chỉ gồm <strong>{data?.items.length ?? 0} bản ghi của trang đang xem</strong>; muốn có dữ liệu trang khác, chuyển trang rồi xuất tiếp.</p>
      {dataError && <div className="adm5-alert" role="alert">{dataError} <button type="button" onClick={() => setRefreshId(v => v + 1)}>Thử lại</button></div>}
      {loading ? <div className="adm5-placeholder" role="status"><span className="adm5-spinner"/>Đang tải dữ liệu từ Backend...</div> :
        !data?.items.length ? <div className="adm5-placeholder"><strong>Không tìm thấy dữ liệu phù hợp</strong><p>Hãy thử bộ lọc khác hoặc tạo bài thi từ khu vực học viên.</p></div> : <>
        <div className="adm5-result-meta"><span>Tìm thấy <strong>{number(data.total)}</strong> bản ghi · Trang {data.page}/{lastPage}</span><span>15 bản ghi / trang</span></div>
        <div className="adm5-table-scroll"><table className="adm5-table">
          <thead>{tab === "quizzes" ? <tr><th>Đề thi</th><th>Độ khó</th><th>Người tạo</th><th>Số câu</th><th>Lượt làm</th><th>Ngày tạo</th><th>Hành động</th></tr> :
            <tr><th>Bài làm</th><th>Học viên</th><th>Trạng thái</th><th>Điểm</th><th>Thời điểm</th><th>Hành động</th></tr>}</thead>
          <tbody>{tab === "quizzes" ? quizPage?.items.map(q => <tr key={q.id}>
            <td><strong>#{q.id} · {q.title}</strong><small>{q.documentName} · Tài liệu #{q.documentId}</small>{q.isPartialSource && <span className="adm5-chip warning">Nguồn một phần</span>}</td>
            <td><span className="adm5-chip">{difficultyName(q.difficulty)}</span></td>
            <td className="adm5-break">{identity(q.ownerEmail, q.ownerUserId)}</td><td>{number(q.questionCount)}</td>
            <td>{number(q.attemptCount)} <small>{q.submittedCount} đã nộp</small></td><td>{when(q.createdAtUtc)}</td>
            <td><div className="adm5-actions"><button type="button" onClick={() => void openDetail("quiz", q.id)}>Xem đề</button>
              <button type="button" onClick={() => { switchTab("attempts"); setQuizIdDraft(String(q.id)); setQuizId(String(q.id)); }}>Lượt làm</button>
              <button type="button" className="danger" disabled={q.attemptCount !== 0} title={q.attemptCount ? "Không xóa đề có lịch sử làm bài" : "Xóa đề chưa có lượt làm"} onClick={() => { setDetailError(""); setDeleteTarget(q); setDeleteConfirm(""); }}>Xóa</button></div></td>
          </tr>) : attemptPage?.items.map(a => <tr key={a.id}>
            <td><strong>#{a.id} · {a.quizTitle}</strong><small>Đề #{a.quizId} · {a.totalQuestions} câu</small></td>
            <td className="adm5-break">{identity(a.ownerEmail, a.ownerUserId)}</td>
            <td><span className={`adm5-chip ${a.submittedAtUtc ? "ok" : "pending"}`}>{a.submittedAtUtc ? "Đã nộp" : "Chưa nộp"}</span></td>
            <td><strong>{a.submittedAtUtc ? `${number(a.scorePercent)}%` : "—"}</strong><small>{a.submittedAtUtc ? `${number(a.correctCount)}/${a.totalQuestions} câu đúng` : "Chưa chấm điểm"}</small></td>
            <td>{when(a.submittedAtUtc || a.startedAtUtc)}</td>
            <td><button type="button" className="adm5-inline-btn" onClick={() => void openDetail("attempt", a.id)}>Chi tiết</button></td>
          </tr>)}</tbody>
        </table></div>
        <div className="adm5-pagination"><span>Hiển thị tối đa {PAGE_SIZE} bản ghi / trang</span><div>
          <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Trước</button>
          <strong>{page} / {lastPage}</strong>
          <button type="button" disabled={page >= lastPage} onClick={() => setPage(p => Math.min(lastPage, p + 1))}>Sau →</button>
        </div></div>
      </>}
    </section>

    <aside className="adm5-policy"><strong>Quyền hạn và an toàn dữ liệu</strong><p>Chỉ Admin xem dữ liệu toàn hệ thống. Không tiết lộ đáp án đúng của đề chưa nộp. Không sửa điểm hoặc xóa lịch sử bài làm. Chỉ được xóa đề chưa có lượt làm, sau khi nhập xác nhận.</p></aside>

    {(detail || detailLoading || detailError || deleteTarget) && <div className="adm5-modal-root" role="presentation">
      <button type="button" className="adm5-backdrop" aria-label="Đóng hộp thoại" onClick={closeModal} />
      <section className="adm5-modal" role="dialog" aria-modal="true" aria-label={deleteTarget ? "Xác nhận xóa đề" : "Chi tiết quản trị"}>
        <div className="adm5-modal-head"><strong>{deleteTarget ? "Xóa đề thi chưa có lượt làm" : detail?.kind === "quiz" ? "Chi tiết đề thi" : "Chi tiết kết quả"}</strong><button type="button" ref={modalCloseRef} onClick={closeModal} aria-label="Đóng">×</button></div>
        {deleteTarget ? <>
          <h2>{deleteTarget.title}</h2><p>Chỉ xóa đề thi <strong>chưa có lượt làm</strong>. Nội dung đề và các câu hỏi sẽ bị xóa vĩnh viễn.</p>
          <p className="adm5-delete-help">Nhập <code>XOA {deleteTarget.id}</code> để xác nhận:</p>
          <input className="adm5-confirm-input" value={deleteConfirm} onChange={event => setDeleteConfirm(event.target.value)} autoComplete="off" aria-label="Nhập xác nhận xóa" />
          {detailError && <p className="adm5-modal-error" role="alert">{detailError}</p>}
          <div className="adm5-modal-buttons"><button type="button" onClick={closeModal}>Hủy</button><button type="button" className="adm5-danger-btn" disabled={deleteBusy || deleteConfirm.trim() !== `XOA ${deleteTarget.id}`} onClick={() => void confirmDelete()}>{deleteBusy ? "Đang xóa..." : "Xóa đề thi"}</button></div>
        </> : detailLoading ? <div className="adm5-placeholder" role="status">Đang tải chi tiết...</div> : detailError ? <div className="adm5-alert" role="alert">{detailError} <button type="button" onClick={closeModal}>Đóng</button></div> : detail?.kind === "quiz" ? <>
          <h2>{detail.value.title}</h2><dl className="adm5-facts"><div><dt>Tài liệu</dt><dd>{detail.value.documentName}</dd></div><div><dt>Người tạo</dt><dd>{identity(detail.value.ownerEmail, detail.value.ownerUserId)}</dd></div><div><dt>Độ khó</dt><dd>{difficultyName(detail.value.difficulty)}</dd></div><div><dt>Ngày tạo</dt><dd>{when(detail.value.createdAtUtc)}</dd></div><div><dt>Lượt làm</dt><dd>{detail.value.attemptCount}</dd></div></dl>
          <p className="adm5-dialog-note">Đáp án đúng và lời giải của đề không được trả về trong màn xem đề, kể cả với Admin.</p>
          <div className="adm5-question-list">{detail.value.questions.map(q => <article key={q.id}><strong>Câu {q.position + 1}. {q.content}</strong><ol type="A"><li>{q.optionA}</li><li>{q.optionB}</li><li>{q.optionC}</li><li>{q.optionD}</li></ol><small>{q.sourcePageNumber ? `Nguồn trang ${q.sourcePageNumber}` : "Không có số trang"}</small></article>)}</div>
        </> : detail?.kind === "attempt" ? <>
          <h2>{detail.value.quizTitle}</h2><dl className="adm5-facts"><div><dt>Học viên</dt><dd>{identity(detail.value.ownerEmail, detail.value.ownerUserId)}</dd></div><div><dt>Trạng thái</dt><dd>{detail.value.submittedAtUtc ? "Đã nộp" : "Chưa nộp"}</dd></div><div><dt>Điểm</dt><dd>{detail.value.submittedAtUtc ? `${number(detail.value.scorePercent)}%` : "Chưa chấm"}</dd></div><div><dt>Số câu đúng</dt><dd>{number(detail.value.correctCount)} / {detail.value.totalQuestions}</dd></div><div><dt>Thời gian nộp</dt><dd>{when(detail.value.submittedAtUtc)}</dd></div></dl>
          {!detail.value.submittedAtUtc ? <p className="adm5-dialog-note">Bài chưa nộp nên hệ thống không cung cấp đáp án và lời giải.</p> : <div className="adm5-question-list">{detail.value.questions.map(q => <article key={q.id}><span className={`adm5-chip ${q.isCorrect ? "ok" : "warning"}`}>{q.isCorrect ? "Đúng" : "Sai / bỏ trống"}</span><strong>Câu {q.position + 1}. {q.content}</strong><p>Lựa chọn: <b>{q.selectedOption || "Bỏ trống"}</b> · Đáp án: <b>{q.correctOption}</b></p><p>{q.explanation || "Không có giải thích."}</p>{q.sourcePageNumber > 0 && <small>Trang {q.sourcePageNumber}: {q.sourceExcerpt}</small>}</article>)}</div>}
        </> : null}
      </section>
    </div>}
  </div>;
}
