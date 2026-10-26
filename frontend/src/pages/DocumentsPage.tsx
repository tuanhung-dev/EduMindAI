
import "./DocumentsPage.css";
import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { getSubjects } from "../services/subjectService";
import {
  getDocuments,
  uploadDocument,
  getDocumentFileUrl,
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
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleUpload(
    event: React.SubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!file || !subjectId) {
      setError("Vui lòng chọn môn học và file PDF.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("File PDF không được vượt quá 10 MB.");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Chỉ hỗ trợ định dạng PDF.");
      return;
    }

    setUploading(true);

    try {
      await uploadDocument(file, Number(subjectId));

      const updatedDocuments = await getDocuments();
      setDocuments(updatedDocuments);

      setSuccess("Tải tài liệu PDF thành công!");
      setFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Có lỗi xảy ra khi tải tài liệu."
      );
    } finally {
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
          <p>Chọn môn học và tải lên file PDF dưới 10 MB.</p>
        </div>

        <form className="doc-form" onSubmit={handleUpload}>
          <label htmlFor="document-subject">
            Môn học
          </label>

          <select
            id="document-subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
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
            Chọn tài liệu PDF
          </label>

          <input
            id="document-file"
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) =>
              setFile(e.target.files?.[0] || null)
            }
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
            {uploading ? "Đang tải lên..." : "Tải PDF lên hệ thống"}
          </button>
        </form>
      </div>

      <div className="doc-panel">
        <div className="doc-list-heading">
          <h3>📚 Danh sách tài liệu</h3>
          <span>{documents.length} tài liệu</span>
        </div>

        {loading ? (
          <p>Đang tải dữ liệu...</p>
        ) : documents.length === 0 ? (
          <div className="doc-empty">
            <div>📂</div>
            <h3>Chưa có tài liệu</h3>
            <p>Hãy tải tài liệu PDF đầu tiên lên hệ thống.</p>
          </div>
        ) : (
          <div className="doc-list">
            {documents.map(document => {
              const subject = subjects.find(
                s => s.id === document.subjectId
              );

              return (
                <div className="doc-item" key={document.id}>
                  <div className="doc-file-icon">PDF</div>

                  <div className="doc-file-info">
                    <strong>{document.originalFileName}</strong>

                    <p>
                      {subject?.name || `Môn học #${document.subjectId}`}
                      {" · "}
                      {formatSize(document.sizeBytes)}
                    </p>
                  </div>

                  <span className="doc-status">
                    {document.status}
                  </span>
                  
<a
  href={getDocumentFileUrl(document.id)}
  target="_blank"
  rel="noopener noreferrer"
  className="doc-open-btn"
>
  Xem PDF ↗
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
