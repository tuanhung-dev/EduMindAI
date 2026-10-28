
import "./DocumentsPage.css";
import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { getSubjects } from "../services/subjectService";
import {
  getDocuments,
  uploadDocument,
  enqueueDocumentIndex,
  getDocumentFileUrl,
  isWordDocument,
  type DocumentItem,
} from "../services/documentService";

type Subject = Awaited<ReturnType<typeof getSubjects>>[number];

export default function DocumentsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [queuingId, setQueuingId] = useState<number | null>(null);
  const [uploadStage, setUploadStage] = useState<"sending" | "refreshing">("sending");
  const uploadController = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { uploadController.current?.abort(); }, []);

  function cancelUpload() {
    uploadController.current?.abort();
    setError("Đã dừng yêu cầu trên trình duyệt. Máy chủ có thể đã nhận tệp; kiểm tra danh sách trước khi tải lại.");
  }

  useEffect(() => {
    let cancelled = false;

    Promise.all([getSubjects(), getDocuments()])
      .then(([subjectData, documentData]) => {
        if (cancelled) return;

        setSubjects(subjectData);
        setDocuments(documentData);

        const firstActive = subjectData.find(s => s.isActive);

        if (firstActive) {
          setSubjectId(String(firstActive.id));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Không thể tải dữ liệu. Hãy kiểm tra Backend.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Poll only while a background job is queued or processing, and stop after unmount.
  const pendingIndex = documents.some(d => d.status === "Queued" || d.status === "Processing");
  useEffect(() => {
    if (!pendingIndex) return;
    const timer = window.setInterval(() => {
      getDocuments().then(setDocuments).catch(() => {
        setError("Chưa cập nhật được trạng thái lập chỉ mục. Bạn có thể thử tải lại trang.");
      });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [pendingIndex]);

  async function queueIndex(id: number) {
    setError(""); setSuccess(""); setQueuingId(id);
    try {
      await enqueueDocumentIndex(id);
      setDocuments(await getDocuments());
      setSuccess("Đã đưa tài liệu vào hàng đợi. Hệ thống sẽ tự cập nhật trạng thái.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lập chỉ mục tài liệu.");
    } finally { setQueuingId(null); }
  }

  async function handleUpload(
    event: React.SubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!file || !subjectId) {
      setError("Vui lòng chọn môn học và file PDF hoặc Word (.docx).");
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      setError("Tài liệu không được vượt quá 30 MB.");
      return;
    }

    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setError("Chỉ hỗ trợ PDF và Word .docx (file .doc cũ cần chuyển đổi).");
      return;
    }

    const controller = new AbortController();
    uploadController.current = controller;
    setUploading(true); setUploadStage("sending");

    try {
      await uploadDocument(file, Number(subjectId), controller.signal);
      if (controller.signal.aborted) return;
      setUploadStage("refreshing");

      const updatedDocuments = await getDocuments();
      if (controller.signal.aborted) return;
      setDocuments(updatedDocuments);

      setSuccess("Tải tài liệu thành công!");
      setFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(
        err instanceof Error
          ? err.message
          : "Có lỗi xảy ra khi tải tài liệu."
      );
    } finally {
      if (uploadController.current === controller) uploadController.current = null;
      setUploading(false);
    }
  }

  function formatSize(bytes: number) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return (
    <div className="documents-page">
      <div className="section-heading">
        <div>
          <span className="section-eyebrow">
            DOCUMENT KNOWLEDGE CENTER
          </span>
          <h2>Kho tài liệu của tôi</h2>
          <p>
            Tải lên và quản lý tài liệu học tập của bạn.
          </p>
        </div>
      </div>

      <div className="doc-panel">
        <div className="doc-panel-heading">
          <h3>📤 Tải tài liệu mới</h3>
          <p>Chọn môn học và tải lên PDF hoặc Word (.docx) dưới 30 MB.</p>
        </div>

        <form className="doc-form" onSubmit={handleUpload}>
          <label htmlFor="document-subject">
            Môn học
          </label>

          <select
            id="document-subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            disabled={uploading}
            required
          >
            <option value="">-- Chọn môn học --</option>
            {subjects
              .filter(s => s.isActive)
              .map(subject => (
                <option key={subject.id} value={subject.id}>
                  {subject.code} - {subject.name}
                </option>
              ))}
          </select>

          <label htmlFor="document-file">
            Chọn tài liệu PDF hoặc Word (.docx)
          </label>

          <input
            id="document-file"
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) =>
              setFile(e.target.files?.[0] || null)
            }
            disabled={uploading}
            required
          />

          {error && (
            <div className="doc-alert doc-error">
              {error}
            </div>
          )}

          {success && (
            <div className="doc-alert doc-success">
              {success}
            </div>
          )}

          <button
            type="submit"
            className="doc-upload-btn"
            disabled={uploading || loading || !subjectId || !file}
          >
            {uploading ? (uploadStage === "sending" ? "Đang gửi tệp…" : "Đang cập nhật danh sách…") : "Tải tài liệu lên hệ thống"}
          </button>
          {uploading && <div className="emc-upload-status" role="status" aria-live="polite">
            <span className="emc-spinner" aria-hidden="true" />
            <span>{uploadStage === "sending" ? "Máy chủ đang nhận và kiểm tra tệp…" : "Đang đồng bộ danh sách tài liệu…"}</span>
            {uploadStage === "sending" && <button type="button" className="emc-cancel" onClick={cancelUpload}>Dừng yêu cầu</button>}
          </div>}
          <p className="emc-muted-note">Trạng thái phản ánh giai đoạn xử lý, không phải phần trăm upload. Lập chỉ mục AI thực hiện sau khi tải tệp thành công.</p>
        </form>
      </div>

      <div className="doc-panel">
        <div className="doc-list-heading">
          <h3>📚 Danh sách tài liệu</h3>
          <span>{documents.length} tài liệu</span>
        </div>

        {loading ? (
          <div className="emc-document-skeleton" role="status" aria-label="Đang tải danh sách tài liệu">
            <span /><span /><span />
          </div>
        ) : documents.length === 0 ? (
          <div className="doc-empty">
            <div>📂</div>
            <h3>Chưa có tài liệu</h3>
            <p>Hãy tải PDF hoặc Word đầu tiên lên hệ thống.</p>
          </div>
        ) : (
          <div className="doc-list">
            {documents.map(document => {
              const subject = subjects.find(
                s => s.id === document.subjectId
              );

              return (
                <div className="doc-item" key={document.id}>
                  <div className="doc-file-icon">{isWordDocument(document) ? "DOCX" : "PDF"}</div>

                  <div className="doc-file-info">
                    <strong>{document.originalFileName}</strong>

                    <p>
                      {subject?.name || `Môn học #${document.subjectId}`}
                      {" · "}
                      {formatSize(document.sizeBytes)}
                    </p>
                  </div>

                  <span className="doc-status" role="status">
                    {document.status === "Queued" ? "Đang chờ xử lý" :
                     document.status === "Processing" ? "Đang đọc tài liệu…" :
                     document.status === "Ready" ? "Đã sẵn sàng" :
                     document.status === "Failed" ? "Xử lý lỗi" : "Chưa lập chỉ mục"}
                  </span>
                  <button
                    type="button"
                    className="doc-open-btn"
                    disabled={queuingId !== null || document.status === "Queued" || document.status === "Processing"}
                    onClick={() => void queueIndex(document.id)}
                    aria-label={`Lập chỉ mục nền cho ${document.originalFileName}`}
                  >
                    {document.status === "Ready" ? "Lập chỉ mục lại" :
                     document.status === "Queued" || document.status === "Processing" ? "Đang xử lý…" :
                     queuingId === document.id ? "Đang gửi…" : "Lập chỉ mục nền"}
                  </button>
                  
<a
  href={getDocumentFileUrl(document.id)}
  target="_blank"
  rel="noopener noreferrer"
  className="doc-open-btn"
>
  {isWordDocument(document) ? "Tải Word ↗" : "Xem PDF ↗"}
</a>

                  <Link
                    to={`/app/ai-tutor?documentId=${document.id}`}
                    className="doc-open-btn"
                  >
                    Hỏi AI ✦
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
