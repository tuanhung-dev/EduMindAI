import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { authenticatedFetch } from "../services/authService";

export default function PdfViewerPage() {
  const { id } = useParams();
  const [src, setSrc] = useState("");
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
        if (!response.ok) throw new Error("Không thể mở PDF hoặc bạn không có quyền truy cập.");
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        // #page=x trong liên kết nguồn được chuyển đến trình đọc PDF nội bộ.
        if (active) setSrc(objectUrl + (window.location.hash || ""));
      } catch (err) { if (active) setError(err instanceof Error ? err.message : "Không mở được PDF."); }
    };
    void run();
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  return <div style={{ minHeight: "100vh", display: "grid", gridTemplateRows: "auto 1fr" }}>
    <header style={{ padding: "12px 18px", display: "flex", gap: 16, alignItems: "center" }}>
      <a href="/app/documents">← Quay về Kho tài liệu</a><strong>Xem PDF có kiểm tra quyền truy cập</strong>
    </header>
    {error ? <p role="alert">{error}</p> : src ?
      <iframe src={src} title="Nội dung PDF" style={{ width: "100%", height: "calc(100vh - 60px)", border: 0 }} /> :
      <p style={{ padding: 16 }}>Đang mở PDF…</p>}
  </div>;
}
