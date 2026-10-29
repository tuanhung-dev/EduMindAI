import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getSubjects, type Subject } from "../services/subjectService";
import {
  enqueueDocumentIndex,
  getDocumentFileUrl,
  getDocuments,
  isWordDocument,
  uploadDocument,
  type DocumentItem,
} from "../services/documentService";
import "./DocumentsPage.css";

type StatusFilter = "all" | "ready" | "processing" | "uploaded" | "failed";
type FileFilter = "all" | "pdf" | "docx";
type SortMode = "newest" | "oldest" | "name" | "size";
type ViewMode = "grid" | "list";

const MAX_SIZE = 30 * 1024 * 1024;
const collator = new Intl.Collator("vi-VN", { sensitivity: "base", numeric: true });
const normalize = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();

function statusGroup(status: string): Exclude<StatusFilter, "all"> {
  const value = status.toLowerCase();
  if (value === "ready") return "ready";
  if (value === "queued" || value === "processing") return "processing";
  if (value === "failed") return "failed";
  return "uploaded";
}

function statusLabel(status: string): string {
  switch (status.toLowerCase()) {
    case "ready": return "Sẵn sàng hỏi AI";
    case "queued": return "Đang chờ xử lý";
    case "processing": return "Đang đọc tài liệu";
    case "failed": return "Xử lý thất bại";
    default: return "Chưa lập chỉ mục";
  }
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(0, bytes / 1024).toFixed(1)} KB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Chưa rõ ngày" : date.toLocaleDateString("vi-VN");
}

function validateFile(candidate: File): string | null {
  if (!/\.(pdf|docx)$/i.test(candidate.name)) return "Chỉ hỗ trợ file PDF hoặc Word .docx.";
  if (candidate.size === 0) return "Tệp đang trống, hãy chọn tệp khác.";
  if (candidate.size > MAX_SIZE) return "Dung lượng tài liệu không được vượt quá 30 MB.";
  return null;
}

export default function DocumentsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState("");
  const [subjectError, setSubjectError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [autoIndex, setAutoIndex] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<"sending" | "refreshing">("sending");
  const [queuingId, setQueuingId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [fileType, setFileType] = useState<FileFilter>("all");
  const [filterSubject, setFilterSubject] = useState("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [view, setView] = useState<ViewMode>("grid");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadController = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([getSubjects(), getDocuments()]).then(([a, b]) => {
      if (!active) return;
      if (a.status === "fulfilled") {
        setSubjects(a.value);
        const first = a.value.find(s => s.isActive);
        setSubjectId(current => current || (first ? String(first.id) : ""));
      } else setSubjectError("Chưa tải được danh sách môn học. Hãy làm mới trang để thử lại.");
      if (b.status === "fulfilled") setDocuments(b.value);
      else setListError("Không tải được kho tài liệu. Kiểm tra kết nối rồi thử làm mới.");
      setInitialLoading(false);
    });
    return () => { active = false; uploadController.current?.abort(); };
  }, []);

  // Chỉ hỏi lại trạng thái khi có tài liệu đang chờ/được xử lý.
  const hasPending = documents.some(d => statusGroup(d.status) === "processing");
  useEffect(() => {
    if (!hasPending) return;
    let active = true;
    let busy = false;
    const timer = window.setInterval(() => {
      if (busy) return;
      busy = true;
      void getDocuments().then(items => {
        if (active) { setDocuments(items); setListError(""); }
      }).catch(() => {
        if (active) setListError("Chưa cập nhật được trạng thái xử lý. Bấm Làm mới để thử lại.");
      }).finally(() => { busy = false; });
    }, 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [hasPending]);

  async function refreshAll() {
    setRefreshing(true);
    const [a, b] = await Promise.allSettled([getSubjects(), getDocuments()]);
    if (a.status === "fulfilled") {
      setSubjects(a.value);
      setSubjectError("");
      setSubjectId(current => current || String(a.value.find(s => s.isActive)?.id ?? ""));
    } else setSubjectError("Không tải được danh sách môn học.");
    if (b.status === "fulfilled") { setDocuments(b.value); setListError(""); }
    else setListError("Không tải được kho tài liệu. Hãy thử lại.");
    setRefreshing(false);
  }

  function chooseFile(candidate: File | null) {
    setError(""); setNotice("");
    if (candidate) {
      const invalid = validateFile(candidate);
      if (invalid) { setError(invalid); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; return; }
    }
    setFile(candidate);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (uploading) return;
    if (event.dataTransfer.files.length > 1) {
      setError("Mỗi lần chỉ tải một tài liệu. Hãy chọn một file PDF/DOCX.");
      return;
    }
    chooseFile(event.dataTransfer.files[0] ?? null);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0] ?? null);
  }

  function cancelUpload() {
    uploadController.current?.abort();
    setNotice("Đã dừng yêu cầu. Tệp có thể đã tới máy chủ; hãy làm mới danh sách trước khi gửi lại.");
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setNotice("");
    if (!file || !subjectId) { setError("Hãy chọn môn học và tài liệu PDF/DOCX."); return; }
    const invalid = validateFile(file);
    if (invalid) { setError(invalid); return; }

    const controller = new AbortController();
    uploadController.current = controller;
    setUploading(true); setUploadStage("sending");
    try {
      const created = await uploadDocument(file, Number(subjectId), controller.signal);
      if (controller.signal.aborted) return;
      setUploadStage("refreshing");
      let indexingOkay = true;
      if (autoIndex) {
        try { await enqueueDocumentIndex(created.id); }
        catch { indexingOkay = false; }
      }
      try {
        setDocuments(await getDocuments());
        setListError("");
      } catch { setListError("Tệp đã tải lên, nhưng chưa làm mới được danh sách. Bấm Làm mới."); }
      setNotice(indexingOkay
        ? autoIndex ? "Đã tải tài liệu và yêu cầu lập chỉ mục. Trạng thái sẽ tự cập nhật." : "Đã tải tài liệu. Bấm Lập chỉ mục để sử dụng Gia sư AI."
        : "Tài liệu đã tải lên, nhưng chưa xếp hàng lập chỉ mục được. Hãy bấm Lập chỉ mục tại thẻ tài liệu.");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Tải tài liệu thất bại.");
    } finally {
      if (uploadController.current === controller) uploadController.current = null;
      setUploading(false);
    }
  }

  async function queueIndex(id: number) {
    setError(""); setNotice(""); setQueuingId(id);
    try {
      await enqueueDocumentIndex(id);
      setNotice("Đã thêm tài liệu vào hàng đợi xử lý.");
      try { setDocuments(await getDocuments()); setListError(""); }
      catch { setListError("Đã gửi lệnh xử lý nhưng chưa cập nhật được danh sách."); }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lập chỉ mục tài liệu.");
    } finally { setQueuingId(null); }
  }

  const counts = useMemo(() => ({
    ready: documents.filter(d => statusGroup(d.status) === "ready").length,
    processing: documents.filter(d => statusGroup(d.status) === "processing").length,
    failed: documents.filter(d => statusGroup(d.status) === "failed").length,
  }), [documents]);

  const subjectNames = useMemo(() => new Map(subjects.map(s => [s.id, `${s.code} · ${s.name}`])), [subjects]);
  const visible = useMemo(() => documents.filter(d => {
    const textMatch = normalize(`${d.originalFileName} ${subjectNames.get(d.subjectId) ?? ""}`).includes(normalize(query.trim()));
    const statusMatch = status === "all" || statusGroup(d.status) === status;
    const typeMatch = fileType === "all" || (fileType === "docx" ? isWordDocument(d) : !isWordDocument(d));
    const subjectMatch = filterSubject === "all" || d.subjectId === Number(filterSubject);
    return textMatch && statusMatch && typeMatch && subjectMatch;
  }).sort((a, b) => {
    if (sort === "name") return collator.compare(a.originalFileName, b.originalFileName);
    if (sort === "size") return b.sizeBytes - a.sizeBytes;
    const delta = (Date.parse(b.createdAtUtc) || 0) - (Date.parse(a.createdAtUtc) || 0);
    return sort === "oldest" ? -delta : delta;
  }), [documents, subjectNames, query, status, fileType, filterSubject, sort]);

  const resetFilters = () => { setQuery(""); setStatus("all"); setFileType("all"); setFilterSubject("all"); };
  const activeSubjects = subjects.filter(s => s.isActive);

  return (
    <div className="edocs-page">
      <header className="edocs-hero">
        <div>
          <span className="edocs-eyebrow">EDUMIND AI · KHÔNG GIAN HỌC LIỆU</span>
          <h1>Kho tài liệu <em>của bạn</em></h1>
          <p>Tập hợp tài liệu học tập ở một nơi, chuẩn bị nội dung cho Gia sư AI và dễ dàng quay lại kiến thức cần ôn tập.</p>
          <div className="edocs-hero-actions">
            <a href="#tai-tai-lieu" className="edocs-btn edocs-btn-light">＋ Thêm tài liệu</a>
            <Link to="/app/ai-tutor" className="edocs-btn edocs-btn-ghost">✦ Mở Gia sư AI ↗</Link>
          </div>
        </div>
        <div className="edocs-hero-art" aria-hidden="true"><span>PDF</span><span>DOCX</span><strong>✦</strong><small>Tài liệu → AI → Kiến thức</small></div>
      </header>

      <section className="edocs-metrics" aria-label="Tổng quan tài liệu">
        <div className="edocs-metric"><span>▤</span><div><small>Tổng tài liệu</small><strong>{initialLoading || listError && !documents.length ? "—" : documents.length}</strong></div></div>
        <div className="edocs-metric"><span>✓</span><div><small>Sẵn sàng hỏi AI</small><strong>{initialLoading || listError && !documents.length ? "—" : counts.ready}</strong></div></div>
        <div className="edocs-metric"><span>◷</span><div><small>Đang xử lý</small><strong>{initialLoading || listError && !documents.length ? "—" : counts.processing}</strong></div></div>
        <div className="edocs-metric"><span>!</span><div><small>Cần kiểm tra</small><strong>{initialLoading || listError && !documents.length ? "—" : counts.failed}</strong></div></div>
      </section>

      <div className="edocs-setup-grid">
        <section className="edocs-panel" id="tai-tai-lieu" aria-labelledby="edocs-upload-title">
          <div className="edocs-panel-heading"><div><span className="edocs-overline">BƯỚC 01</span><h2 id="edocs-upload-title">Tải tài liệu mới</h2><p>Hỗ trợ PDF và Word (.docx), tối đa 30 MB mỗi file.</p></div></div>
          <form onSubmit={handleUpload} className="edocs-upload-form">
            <label className="edocs-field-label" htmlFor="edocs-subject">Môn học <span>*</span></label>
            <select id="edocs-subject" value={subjectId} onChange={e => setSubjectId(e.target.value)} disabled={uploading || initialLoading} required>
              <option value="">Chọn môn học cho tài liệu</option>
              {activeSubjects.map(s => <option value={s.id} key={s.id}>{s.code} — {s.name}</option>)}
            </select>
            {subjectError && <p className="edocs-field-hint edocs-error-text">{subjectError}</p>}
            {!initialLoading && !activeSubjects.length && !subjectError && <p className="edocs-field-hint">Chưa có môn học hoạt động. <Link to="/app/subjects">Xem danh mục môn học</Link>.</p>}
            <span className="edocs-field-label">File tài liệu <span>*</span></span>
            <label className={`edocs-dropzone ${dragging ? "is-dragging" : ""} ${uploading ? "is-disabled" : ""}`}
              htmlFor="edocs-file" onDragEnter={e => { e.preventDefault(); if (!uploading) setDragging(true); }}
              onDragOver={e => { e.preventDefault(); if (!uploading) setDragging(true); }}
              onDragLeave={e => { e.preventDefault(); if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
              onDrop={onDrop}>
              <input id="edocs-file" ref={fileInputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onFileChange} disabled={uploading} />
              <span className="edocs-dropzone-icon">↑</span>
              {file ? <><strong title={file.name}>{file.name}</strong><small>{formatSize(file.size)} · Nhấn để chọn tệp khác</small></>
                : <><strong>Kéo thả tài liệu vào đây</strong><small>Hoặc nhấn để chọn PDF / Word từ thiết bị</small></>}
            </label>
            <label className="edocs-check"><input type="checkbox" checked={autoIndex} onChange={e => setAutoIndex(e.target.checked)} disabled={uploading} /> <span>Tự đưa vào hàng đợi xử lý AI sau khi tải</span></label>
            <button className="edocs-btn edocs-btn-primary edocs-upload-submit" disabled={uploading || initialLoading || !subjectId || !file} type="submit">
              {uploading ? uploadStage === "sending" ? "Đang tải lên..." : "Đang cập nhật..." : "↑ Tải tài liệu lên"}
            </button>
            {uploading && <div className="edocs-upload-progress" role="status">{uploadStage === "sending" ? "Đang gửi tệp tới máy chủ..." : "Đang cập nhật kho tài liệu..."}{uploadStage === "sending" && <button type="button" onClick={cancelUpload}>Dừng yêu cầu</button>}</div>}
            <p className="edocs-field-hint">Không hiển thị % giả: tiến trình xử lý AI được cập nhật theo trạng thái máy chủ.</p>
          </form>
        </section>
        <section className="edocs-panel edocs-guide" aria-labelledby="edocs-guide-title">
          <div className="edocs-panel-heading"><div><span className="edocs-overline">BẮT ĐẦU DỄ DÀNG</span><h2 id="edocs-guide-title">Từ tài liệu đến câu trả lời</h2><p>Ba bước để sử dụng học liệu hiệu quả.</p></div></div>
          <ol className="edocs-steps">
            <li><span>01</span><div><strong>Tải PDF hoặc Word</strong><p>Chọn đúng môn học để dễ tìm lại tài liệu sau này.</p></div></li>
            <li><span>02</span><div><strong>Chờ tài liệu sẵn sàng</strong><p>Hệ thống xử lý nội dung, sau đó chuyển trạng thái sang “Sẵn sàng hỏi AI”.</p></div></li>
            <li><span>03</span><div><strong>Học cùng Gia sư AI</strong><p>Đặt câu hỏi, xem nguồn trích dẫn và luyện tập kiến thức.</p></div></li>
          </ol>
          <div className="edocs-guide-note"><strong>Mẹo:</strong> Tài liệu bị lỗi có thể thử lập chỉ mục lại. Nếu là PDF dạng ảnh, khả năng đọc còn phụ thuộc nội dung và hệ thống xử lý.</div>
        </section>
      </div>

      {(error || notice) && <div className={`edocs-feedback ${error ? "is-error" : "is-success"}`} role={error ? "alert" : "status"}>
        <span>{error || notice}</span><button type="button" onClick={() => { setError(""); setNotice(""); }} aria-label="Đóng thông báo">×</button>
      </div>}

      <section className="edocs-library" id="danh-sach-tai-lieu" aria-labelledby="edocs-library-title">
        <div className="edocs-library-heading"><div><span className="edocs-overline">THƯ VIỆN CÁ NHÂN</span><h2 id="edocs-library-title">Danh sách tài liệu</h2><p>Tìm nhanh theo tên, môn học, định dạng và trạng thái xử lý.</p></div><button className="edocs-btn edocs-btn-outline" type="button" onClick={() => void refreshAll()} disabled={refreshing || initialLoading}>↻ {refreshing ? "Đang làm mới..." : "Làm mới"}</button></div>
        <div className="edocs-toolbar">
          <label className="edocs-search"><span>⌕</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm tên tài liệu hoặc môn học..." aria-label="Tìm kiếm tài liệu" /></label>
          <label>Trạng thái<select value={status} onChange={e => setStatus(e.target.value as StatusFilter)}><option value="all">Tất cả</option><option value="ready">Sẵn sàng</option><option value="processing">Đang xử lý</option><option value="uploaded">Chưa lập chỉ mục</option><option value="failed">Xử lý lỗi</option></select></label>
          <label>Loại file<select value={fileType} onChange={e => setFileType(e.target.value as FileFilter)}><option value="all">PDF và Word</option><option value="pdf">PDF</option><option value="docx">Word (.docx)</option></select></label>
          <label>Môn học<select value={filterSubject} onChange={e => setFilterSubject(e.target.value)}><option value="all">Tất cả môn</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        </div>
        <div className="edocs-list-options"><span>Hiển thị <strong>{visible.length}</strong> / {documents.length} tài liệu</span><div><label>Sắp xếp<select value={sort} onChange={e => setSort(e.target.value as SortMode)}><option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="name">Tên A–Z</option><option value="size">Dung lượng giảm dần</option></select></label><div className="edocs-view" role="group" aria-label="Kiểu hiển thị"><button type="button" aria-label="Dạng thẻ" aria-pressed={view === "grid"} className={view === "grid" ? "is-active" : ""} onClick={() => setView("grid")}>▦</button><button type="button" aria-label="Dạng danh sách" aria-pressed={view === "list"} className={view === "list" ? "is-active" : ""} onClick={() => setView("list")}>☷</button></div></div></div>
        {listError && <div className="edocs-inline-error" role="alert">{listError} <button type="button" onClick={() => void refreshAll()}>Thử lại</button></div>}
        {initialLoading ? <div className="edocs-empty" role="status">Đang tải danh sách tài liệu...</div>
          : listError && documents.length === 0 ? <div className="edocs-empty">Không thể tải dữ liệu. Hãy kiểm tra kết nối và bấm Làm mới.</div>
          : documents.length === 0 ? <div className="edocs-empty"><span>▤</span><h3>Kho tài liệu của bạn đang trống</h3><p>Tải một file Word/PDF để bắt đầu hành trình học tập cùng EduMindAI.</p><a href="#tai-tai-lieu" className="edocs-btn edocs-btn-primary">＋ Tải tài liệu đầu tiên</a></div>
          : visible.length === 0 ? <div className="edocs-empty"><span>⌕</span><h3>Không có tài liệu phù hợp</h3><p>Thử từ khóa hoặc bộ lọc khác.</p><button type="button" className="edocs-btn edocs-btn-primary" onClick={resetFilters}>Xóa bộ lọc</button></div>
          : <div className={`edocs-cards ${view === "list" ? "edocs-cards-list" : ""}`}>
              {visible.map(doc => {
                const kind = isWordDocument(doc) ? "DOCX" : "PDF";
                const group = statusGroup(doc.status);
                const processing = group === "processing";
                const busy = queuingId === doc.id;
                return <article className="edocs-card" key={doc.id}>
                  <div className="edocs-card-top"><div className={`edocs-file-icon ${kind === "DOCX" ? "is-word" : ""}`}>{kind}</div><span className={`edocs-status is-${group}`}>{statusLabel(doc.status)}</span></div>
                  <div className="edocs-card-body"><h3 title={doc.originalFileName}>{doc.originalFileName}</h3><p>{subjectNames.get(doc.subjectId) ?? `Môn học #${doc.subjectId}`}</p><div className="edocs-meta"><span>{formatSize(doc.sizeBytes)}</span><span>{formatDate(doc.createdAtUtc)}</span></div></div>
                  <div className="edocs-card-actions"><Link className="edocs-action edocs-action-secondary" to={`/app/documents/${doc.id}`}>Chi tiết ↗</Link><Link className="edocs-action edocs-action-secondary" to={getDocumentFileUrl(doc.id)} target="_blank" rel="noopener noreferrer">{kind === "DOCX" ? "Mở / tải Word ↗" : "Xem PDF ↗"}</Link>{group === "ready" ? <Link className="edocs-action edocs-action-primary" to={`/app/ai-tutor?documentId=${doc.id}`}>✦ Hỏi AI</Link> : <button type="button" className="edocs-action edocs-action-primary" onClick={() => void queueIndex(doc.id)} disabled={processing || queuingId !== null}>{processing ? "Đang xử lý..." : busy ? "Đang gửi..." : "Lập chỉ mục"}</button>}</div>
                  {group === "ready" && <button className="edocs-reindex" type="button" disabled={queuingId !== null} onClick={() => void queueIndex(doc.id)}>↻ Lập chỉ mục lại</button>}
                  <details className="edocs-details"><summary>Xem thông tin tài liệu</summary><dl><div><dt>Mã tài liệu</dt><dd>#{doc.id}</dd></div><div><dt>Loại file</dt><dd>{kind}</dd></div><div><dt>Trạng thái</dt><dd>{statusLabel(doc.status)}</dd></div><div><dt>Ngày tải</dt><dd>{formatDate(doc.createdAtUtc)}</dd></div></dl></details>
                </article>;
              })}
            </div>}
      </section>
      <div className="edocs-footnote">EduMindAI sử dụng tài liệu đã lập chỉ mục làm nguồn cho Gia sư AI. Chỉ tài liệu ở trạng thái <strong>Sẵn sàng hỏi AI</strong> mới có thể chọn để hỏi trực tiếp.</div>
    </div>
  );
}
