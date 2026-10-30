import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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
      if (!Number.isSafeInteger(documentId) || documentId <= 0) {
        setError("ID tài liệu không hợp lệ."); return;
      }
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
  return <div style={{ minHeight: "100vh", display: "grid", gridTemplateRows: "auto 1fr" }}>
    <header style={{ padding: "12px 18px", display: "flex", gap: 16, alignItems: "center" }}>
      <a href="/app/documents">← Quay về Kho tài liệu</a>
      <strong>Đọc tài liệu có kiểm tra quyền truy cập</strong>
    </header>
    {error ? <p role="alert">{error}</p> : !src ? <p style={{ padding: 16 }}>Đang tải tài liệu…</p> : wordFile ?
      <div style={{ margin: "auto", padding: 30, maxWidth: 600, textAlign: "center" }}>
        <h2>Tài liệu Word đã sẵn sàng</h2>
        <p>Trình duyệt không thể mở trực tiếp Word như PDF. Bạn có thể tải bản gốc về; EduMind AI vẫn trích xuất chữ để học cùng AI.</p>
        <a href={src} download={`EduMindAI-TaiLieu-${id}.docx`}>↓ Tải bản Word (.docx)</a>
      </div> :
      <iframe src={src} title="Nội dung PDF" style={{ width: "100%", height: "calc(100vh - 60px)", border: 0 }} />}
  </div>;
}
