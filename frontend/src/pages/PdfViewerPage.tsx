import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { authenticatedFetch } from "../services/authService";

export default function PdfViewerPage() {
  const { id } = useParams();
  const [src, setSrc] = useState("");
  const [wordFile, setWordFile] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    const run = async () => {
      const documentId = Number(id);
      if (!Number.isSafeInteger(documentId) || documentId <= 0) { setError("ID tài liệu không hợp lệ."); return; }
      try {
        const response = await authenticatedFetch(`/api/documents/${documentId}/file`);
        if (!response.ok) throw new Error("Không thể mở tài liệu hoặc bạn không có quyền truy cập.");
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (active) {
          const isDocx = (response.headers.get("content-type") || "").includes("wordprocessingml");
          setWordFile(isDocx);
          setSrc(objectUrl + (isDocx ? "" : window.location.hash || ""));
        }
      } catch (err) { if (active) setError(err instanceof Error ? err.message : "Không mở được tài liệu."); }
    };
    void run();
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  return <div className="emw-document-viewer">
    <header className="emw-document-viewer-head">
      <Link to="/app/documents" className="emw-button emw-button-outline">← Kho tài liệu</Link>
      <div><span className="emw-eyebrow">TRÌNH XEM TÀI LIỆU</span><h1>Tài liệu #{id}</h1></div>
      <Link to="/app/ai-tutor" className="emw-button emw-button-primary">✦ Hỏi Gia sư AI</Link>
    </header>
    <main className="emw-document-viewer-body">
      {error ? <div role="alert" className="emw-state emw-alert emw-alert-error">{error}</div> : !src ? <div role="status" className="emw-state"><span className="emw-loading-icon" aria-hidden="true" /> Đang tải tài liệu…</div> : wordFile ?
        <div className="emw-docx-download"><span aria-hidden="true">▤</span><h2>Tài liệu Word đã sẵn sàng</h2><p>Trình duyệt không hỗ trợ xem trực tiếp Word như PDF. Bạn có thể tải bản gốc; Gia sư AI vẫn sử dụng nội dung đã được xử lý.</p><a href={src} download={`EduMindAI-TaiLieu-${id}.docx`} className="emw-button emw-button-primary">↓ Tải bản Word (.docx)</a></div> :
        <iframe src={src} title="Nội dung tài liệu PDF" className="emw-pdf-frame" />}
    </main>
  </div>;
}
