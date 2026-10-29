import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  enqueueDocumentIndex, fetchDocumentBlob, getDocuments, getDocumentTextPreview,
  isWordDocument, type DocumentItem, type DocumentTextPreview,
} from "../services/documentService";
import { getSubjects, type Subject } from "../services/subjectService";
import { apiErrorMessage } from "../services/apiClient";
import "./DocumentDetailPage.css";

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "Không rõ";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Không rõ" : date.toLocaleString("vi-VN");
}
function statusInfo(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "ready") return { label: "Sẵn sàng hỏi AI", className: "is-ready", description: "Tài liệu đã được lập chỉ mục. Bạn có thể hỏi Gia sư AI theo nội dung này." };
  if (["queued", "processing"].includes(normalized)) return { label: "Đang xử lý", className: "is-processing", description: "Hệ thống đang xử lý tài liệu. Trạng thái sẽ tự cập nhật." };
  if (normalized === "failed") return { label: "Xử lý thất bại", className: "is-failed", description: "Bạn có thể thử gửi yêu cầu lập chỉ mục lại." };
  return { label: "Chưa lập chỉ mục", className: "is-uploaded", description: "Bạn cần xử lý tài liệu trước khi có thể hỏi Gia sư AI." };
}

export default function DocumentDetailPage() {
  const { id } = useParams();
  const parsedId = Number(id);
  const validId = Number.isSafeInteger(parsedId) && parsedId > 0;
  const [document, setDocument] = useState<DocumentItem | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [indexing, setIndexing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [textPreview, setTextPreview] = useState<DocumentTextPreview | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const refresh = useCallback(async (showSpinner = false) => {
    if (!validId) { setError("Mã tài liệu không hợp lệ."); setLoading(false); return; }
    if (showSpinner) setRefreshing(true);
    try {
      const results = await Promise.allSettled([getDocuments(), getSubjects()]);
      const [docsResult, subjectsResult] = results;
      if (docsResult.status === "rejected") throw docsResult.reason;
      const found = docsResult.value.find(item => item.id === parsedId) ?? null;
      setDocument(found);
      if (subjectsResult.status === "fulfilled") setSubjects(subjectsResult.value);
      setError(found ? "" : "Không tìm thấy tài liệu hoặc tài liệu không thuộc tài khoản này.");
    } catch (cause) { setError(apiErrorMessage(cause, "Không tải được thông tin tài liệu.")); }
    finally { setLoading(false); if (showSpinner) setRefreshing(false); }
  }, [validId, parsedId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const state = document ? statusInfo(document.status) : null;
  const pending = !!document && ["queued", "processing"].includes(document.status.toLowerCase());
  useEffect(() => {
    if (!pending || document?.id !== parsedId) return;
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    return () => window.clearInterval(timer);
  }, [pending, document?.id, parsedId, refresh]);

  // PDF chi hien thi tu Blob co Bearer token, khong dua token vao URL.
  const fileId = document?.id;
  const fileName = document?.originalFileName;
  useEffect(() => {
    if (!fileId || fileName?.toLowerCase().endsWith(".docx")) return;
    const controller = new AbortController();
    let url = "";
    const run = async () => {
      setPreviewLoading(true); setPreviewError(""); setPreviewUrl("");
      try {
        const blob = await fetchDocumentBlob(fileId, controller.signal);
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      } catch (cause) {
        if (!controller.signal.aborted) setPreviewError(apiErrorMessage(cause, "Không tải được bản xem trước PDF."));
      } finally { if (!controller.signal.aborted) setPreviewLoading(false); }
    };
    void run();
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [fileId, fileName]);

  useEffect(() => {
    if (!fileId) return;
    const controller = new AbortController();
    // Hoan thanh promise truoc khi setState, khong goi setState dong bo trong effect.
    const run = async () => {
      setTextLoading(true); setTextError(""); setTextPreview(null);
      try {
        const data = await getDocumentTextPreview(fileId, controller.signal);
        if (!controller.signal.aborted) setTextPreview(data);
      } catch (cause) {
        if (!controller.signal.aborted) setTextError(apiErrorMessage(cause, "Không trích xuất được văn bản xem trước."));
      } finally { if (!controller.signal.aborted) setTextLoading(false); }
    };
    void run();
    return () => controller.abort();
  }, [fileId]);

  async function downloadOriginal() {
    if (!document || downloading) return;
    setDownloading(true); setError("");
    let url = "";
    try {
      const blob = await fetchDocumentBlob(document.id);
      url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = document.originalFileName;
      window.document.body.appendChild(link);
      link.click(); link.remove();
    } catch (cause) { setError(apiErrorMessage(cause, "Không tải được tài liệu gốc.")); }
    finally { if (url) window.setTimeout(() => URL.revokeObjectURL(url), 1000); setDownloading(false); }
  }

  async function queueIndex() {
    if (!document || indexing || pending) return;
    setIndexing(true); setError(""); setNotice("");
    try {
      const queued = await enqueueDocumentIndex(document.id);
      setNotice("Đã gửi yêu cầu xử lý tài liệu. Trạng thái sẽ được tự động cập nhật.");
      setDocument(current => current ? { ...current, status: queued.status || "Queued" } : current);
    } catch (cause) { setError(apiErrorMessage(cause, "Chưa thể gửi yêu cầu xử lý tài liệu.")); }
    finally { setIndexing(false); }
  }

  const subject = subjects.find(item => item.id === document?.subjectId);
  const word = document ? isWordDocument(document) : false;
  const ready = document?.status.toLowerCase() === "ready";

  return <div className="edd-page">
    <nav className="edd-breadcrumb" aria-label="Đường dẫn"><Link to="/app/documents">Kho tài liệu</Link><span aria-hidden="true">/</span><span>Chi tiết tài liệu</span></nav>
    <header className="edd-hero">
      <div className="edd-hero-copy"><span className="edd-eyebrow">EDUMIND AI · CHI TIẾT HỌC LIỆU</span>
        <h1>Khám phá <em>tài liệu của bạn.</em></h1>
        <p>Kiểm tra trạng thái, xem trước nội dung và lựa chọn bước học tiếp theo trên một trang duy nhất.</p>
      </div>
      <div className="edd-hero-actions"><Link to="/app/documents" className="edd-btn edd-btn-outline-light">← Quay lại Kho tài liệu</Link></div>
    </header>
    {loading ? <section className="edd-state" role="status"><span className="edd-spinner"/> Đang tải thông tin tài liệu…</section>
      : error && !document ? <section className="edd-state" role="alert"><strong>Chưa mở được tài liệu</strong><p>{error}</p><button type="button" className="edd-btn edd-btn-primary" onClick={() => void refresh(true)}>Thử lại</button></section>
      : document && state ? <>
        <section className="edd-card edd-title-card">
          <div className={`edd-file-icon ${word ? "is-word" : ""}`}>{word ? "DOCX" : "PDF"}</div>
          <div className="edd-title-content"><span className="edd-eyebrow">MÃ TÀI LIỆU #{document.id}</span><h2 title={document.originalFileName}>{document.originalFileName}</h2><span className={`edd-status ${state.className}`}><span aria-hidden="true">●</span> {state.label}</span></div>
          <button type="button" className="edd-btn edd-btn-outline" disabled={refreshing} onClick={() => void refresh(true)}>{refreshing ? "Đang cập nhật..." : "↻ Làm mới"}</button>
        </section>
        <div className="edd-layout">
          <section className="edd-card edd-primary-panel" aria-labelledby="edd-preview-heading">
            <div className="edd-section-head"><div><span className="edd-eyebrow">NỘI DUNG TÀI LIỆU</span><h2 id="edd-preview-heading">{word ? "Tài liệu Word" : "Xem trước PDF"}</h2></div>
              <button type="button" className="edd-btn edd-btn-outline" onClick={() => void downloadOriginal()} disabled={downloading}>{downloading ? "Đang tải..." : "↓ Tải bản gốc"}</button>
            </div>
            {word ? <div className="edd-word-preview"><span aria-hidden="true">▤</span><h3>Xem và tải tài liệu Word</h3><p>Trình duyệt không hỗ trợ xem DOCX trực tiếp một cách tin cậy. Hãy tải bản gốc để đọc bằng Word; Gia sư AI có thể tra cứu nội dung khi tài liệu đã Ready.</p><button type="button" className="edd-btn edd-btn-primary" onClick={() => void downloadOriginal()} disabled={downloading}>Tải file Word (.docx)</button></div>
              : previewLoading ? <div className="edd-preview-message" role="status"><span className="edd-spinner"/> Đang tải nội dung PDF...</div>
              : previewError ? <div className="edd-preview-message" role="alert">{previewError}<button type="button" className="edd-btn edd-btn-outline" onClick={() => void refresh(true)}>Thử lại</button></div>
              : previewUrl ? <iframe className="edd-pdf" title={`Xem PDF ${document.originalFileName}`} src={previewUrl} />
              : <div className="edd-preview-message">Chưa có bản xem trước.</div>}
            <div className="edd-text-section">
              <h3>▤ Văn bản trích xuất <span>{textPreview ? `${textPreview.extractedPages}/${textPreview.totalPages} ${textPreview.unit === "section" ? "phần" : "trang"}` : ""}</span></h3>
              <p>Đây là bản xem trước có giới hạn từ API, không nhất thiết bao phủ toàn bộ tài liệu.</p>
              {textLoading ? <div className="edd-text-message" role="status">Đang lấy văn bản xem trước...</div>
                : textError ? <div className="edd-text-message is-error" role="alert">{textError}</div>
                : textPreview && textPreview.hasExtractableText ? <div className="edd-excerpts">
                  {textPreview.pages.filter(part => part.text.trim()).map(part =>
                    <details key={part.pageNumber} className="edd-excerpt" open={part.pageNumber === textPreview.pages.find(x => x.text.trim())?.pageNumber}>
                      <summary>{textPreview.unit === "section" ? "Phần" : "Trang"} {part.pageNumber} <span>Nhấn để xem / thu gọn</span></summary>
                      <p>{part.text}</p>
                    </details>)}
                </div> : <div className="edd-text-message">Không có văn bản trích xuất được trong phần xem trước. PDF dạng ảnh có thể cần OCR.</div>}
            </div>
          </section>
          <div className="edd-side-panels">
            <section className="edd-card" aria-labelledby="edd-info-heading"><span className="edd-eyebrow">THÔNG TIN FILE</span><h2 id="edd-info-heading">Chi tiết tài liệu</h2><dl className="edd-meta">
              <div><dt>Tên file</dt><dd title={document.originalFileName}>{document.originalFileName}</dd></div>
              <div><dt>Định dạng</dt><dd>{word ? "Word (.docx)" : "PDF (.pdf)"}</dd></div>
              <div><dt>Dung lượng</dt><dd>{formatFileSize(document.sizeBytes)}</dd></div>
              <div><dt>Ngày tải lên</dt><dd>{formatDate(document.createdAtUtc)}</dd></div>
              <div><dt>Môn học</dt><dd>{subject ? `${subject.code} · ${subject.name}` : `Môn học #${document.subjectId}`}</dd></div>
              <div><dt>ID tài liệu</dt><dd>#{document.id}</dd></div>
            </dl></section>
            <section className="edd-card edd-next" aria-labelledby="edd-next-heading"><span className="edd-eyebrow">BƯỚC TIẾP THEO</span><h2 id="edd-next-heading">Học cùng tài liệu</h2><p className="edd-status-desc">{state.description}</p>
              {ready ? <Link to={`/app/ai-tutor?documentId=${document.id}`} className="edd-btn edd-btn-primary">✦ Hỏi Gia sư AI về tài liệu ↗</Link>
                : <button type="button" className="edd-btn edd-btn-primary" disabled={indexing || pending} onClick={() => void queueIndex()}>{indexing ? "Đang gửi yêu cầu..." : pending ? "Đang chờ xử lý..." : "✦ Bắt đầu lập chỉ mục"}</button>}
              <Link to="/app/quizzes" className="edd-btn edd-btn-outline">◉ Đến Luyện thi AI</Link>
              <p className="edd-hint">Chỉ mở hỏi đáp AI cho tài liệu đã được xử lý xong (Ready). Tạo đề ở trang Luyện thi cũng phụ thuộc tài liệu sẵn sàng.</p>
            </section>
            {notice && <div className="edd-alert" role="status">{notice}</div>}
            {error && <div className="edd-alert is-error" role="alert">{error}</div>}
          </div>
        </div>
      </> : null}
  </div>;
}
