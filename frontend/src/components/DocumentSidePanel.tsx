import { useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "../services/authService";
import type { AiSource } from "../services/aiTutorService";
import type { DocumentItem } from "../services/documentService";

interface Props {
  source: AiSource;
  document: DocumentItem | undefined;
  onClose: () => void;
}

export default function DocumentSidePanel({ source, document: item, onClose }: Props) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const closeButton = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const id = source.documentId ?? item?.id;
  const page = Number.isFinite(source.pageNumber) && source.pageNumber > 0 ? Math.floor(source.pageNumber) : 1;
  const word = (item?.originalFileName ?? source.documentName ?? "").toLowerCase().endsWith(".docx");

  useEffect(() => {
    closeButton.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !mobile || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], iframe, [tabindex]:not([tabindex="-1"])'
      )).filter(node => node.getClientRects().length > 0);
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    const originalOverflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", keydown); document.body.style.overflow = originalOverflow; };
  }, [onClose, mobile]);

  useEffect(() => {
    const abort = new AbortController();
    let blobUrl = "";
    async function load() {
      setBusy(true); setError(""); setUrl("");
      if (!id || !Number.isSafeInteger(id)) { setError("Mã tài liệu không hợp lệ."); setBusy(false); return; }
      try {
        // Access token is sent only in the authenticated request, never in the iframe URL.
        const response = await authenticatedFetch(`/api/documents/${id}/file`, { signal: abort.signal });
        if (!response.ok) throw new Error("Không mở được nguồn hoặc bạn không có quyền truy cập.");
        const data = await response.blob();
        if (abort.signal.aborted) return;
        blobUrl = URL.createObjectURL(data);
        setUrl(blobUrl);
      } catch (cause) {
        if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Không tải được nguồn.");
      } finally { if (!abort.signal.aborted) setBusy(false); }
    }
    void load();
    return () => { abort.abort(); if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [id]);

  return (
    <aside ref={panelRef} className="emc-source-panel" role={mobile ? "dialog" : "region"} aria-modal={mobile ? true : undefined} aria-labelledby="emc-source-title">
      <header className="emc-source-head">
        <div><span className="emc-eyebrow">ĐỐI CHIẾU NGUỒN AI</span><h2 id="emc-source-title">{item?.originalFileName ?? source.documentName ?? "Tài liệu"}</h2></div>
        <button ref={closeButton} className="emc-icon-button" type="button" onClick={onClose} aria-label="Đóng phần xem tài liệu">×</button>
      </header>
      <div className="emc-source-meta">{word ? `Phần văn bản ${page}` : `Trang ${page}`} · Đoạn {source.chunkIndex + 1}</div>
      <section className="emc-source-excerpt" aria-label="Đoạn nguồn AI đã sử dụng"><strong>Đoạn trích đối chiếu</strong><p>{source.excerpt || "Chưa có đoạn trích."}</p></section>
      {busy && <p className="emc-inline-status" role="status"><span className="emc-spinner"/> Đang tải tài liệu có xác thực…</p>}
      {error && <div className="emc-alert" role="alert">{error}</div>}
      {url && (word ? <div className="emc-word-preview">
        <p>Word không có số trang cố định để nhảy tới chính xác. Đoạn trích ở phía trên cho biết phần văn bản AI sử dụng.</p>
        <a className="emc-secondary-action" href={url} download={item?.originalFileName ?? `tai-lieu-${id}.docx`}>Tải Word gốc</a>
      </div> : <iframe className="emc-pdf-frame" title={`PDF - trang ${page}`} src={`${url}#page=${page}&zoom=page-width`} />)}
    </aside>
  );
}
