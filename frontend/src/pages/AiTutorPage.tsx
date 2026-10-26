import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getDocuments, getDocumentFileUrl, type DocumentItem } from "../services/documentService";
import {
  askDocument,
  getPdfAtPage,
  indexDocument,
  summarizeDocument,
  type AiAnswer,
  type AiSummary,
} from "../services/aiTutorService";
import "./AiTutorPage.css";

const suggestedQuestions = [
  "Tài liệu này đề cập đến những nội dung chính nào?",
  "Giải thích khái niệm quan trọng nhất trong tài liệu.",
  "Những kiến thức nào tôi nên ôn tập trước?",
];

function readDocumentId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default function AiTutorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const documentIdInUrl = searchParams.get("documentId");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [summary, setSummary] = useState<AiSummary | null>(null);
  const [mode, setMode] = useState<"ask" | "summary">("ask");
  const [summaryLevel, setSummaryLevel] = useState<"short" | "detailed">("short");
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [indexing, setIndexing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    getDocuments()
      .then((items) => {
        if (!active) return;
        setDocuments(items);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Không tải được kho tài liệu.");
      })
      .finally(() => {
        if (active) setLoadingDocs(false);
      });
    return () => { active = false; };
  }, []);

  // Lấy tài liệu từ URL khi đi từ Kho tài liệu; mặc định là tài liệu đầu tiên.
  const requestedDocumentId = readDocumentId(documentIdInUrl);
  const documentId = documents.some((d) => d.id === requestedDocumentId)
    ? requestedDocumentId
    : (documents[0]?.id ?? null);

  const selectedDocument = documents.find((d) => d.id === documentId);
  const busy = loadingDocs || indexing || asking || summarizing;

  function changeMode(next: "ask" | "summary") {
    if (busy) return;
    setMode(next);
    setError("");
    setNotice("");
  }

  function changeDocument(id: number) {
    setSearchParams({ documentId: String(id) });
    setAnswer(null);
    setSummary(null);
    setError("");
    setNotice("");
  }

  async function handleIndex() {
    if (!documentId || busy) return;
    setError("");
    setNotice("");
    setIndexing(true);
    try {
      const result = await indexDocument(documentId);
      setDocuments((items) => items.map((item) => item.id === documentId ? { ...item, status: result.status } : item));
      setNotice(`Đã xử lý ${result.totalPages} trang, lưu ${result.chunkCount} đoạn nội dung. Bạn có thể đặt câu hỏi.`);
      setAnswer(null);
      setSummary(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể xử lý tài liệu.");
    } finally {
      setIndexing(false);
    }
  }

  async function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!documentId || busy) return;
    const text = question.trim();
    if (text.length < 3 || text.length > 500) {
      setError("Câu hỏi cần dài từ 3 đến 500 ký tự.");
      return;
    }
    setError("");
    setNotice("");
    setAnswer(null);
    setAsking(true);
    try {
      setAnswer(await askDocument(documentId, text));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể nhận câu trả lời từ AI.");
    } finally {
      setAsking(false);
    }
  }

  async function handleSummarize() {
    if (!documentId || busy) return;
    setError("");
    setNotice("");
    setSummary(null);
    setSummarizing(true);
    try {
      setSummary(await summarizeDocument(documentId, summaryLevel));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tóm tắt tài liệu.");
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <section className="tutor-page">
      <div className="tutor-intro">
        <div>
          <span className="tutor-eyebrow">EDUMIND AI / DOCUMENT TUTOR</span>
          <h1>Gia sư AI từ tài liệu của bạn</h1>
          <p>Chọn giáo trình PDF, xử lý nội dung và đặt câu hỏi. Câu trả lời được tạo dựa trên những đoạn văn bản mà hệ thống tìm thấy.</p>
        </div>
        <span className="tutor-demo-tag">Bản thử nghiệm</span>
      </div>

      <div className="tutor-grid">
        <aside className="tutor-card tutor-doc-panel">
          <div className="tutor-card-header">
            <span className="tutor-section-tag">01 / TÀI LIỆU</span>
            <h2>Chọn nguồn học</h2>
          </div>

          {loadingDocs ? <p className="tutor-muted">Đang tải danh sách tài liệu…</p>
          : documents.length === 0 ? (
            <div className="tutor-empty">
              <div className="tutor-empty-icon">▤</div>
              <strong>Chưa có tài liệu PDF</strong>
              <p>Hãy tải một tài liệu lên Kho tài liệu trước khi hỏi Gia sư AI.</p>
              <Link to="/app/documents" className="tutor-text-link">Đi tới Kho tài liệu →</Link>
            </div>
          ) : (
            <>
              <label className="tutor-label" htmlFor="tutor-document">Tài liệu muốn học</label>
              <select
                id="tutor-document"
                value={documentId ?? ""}
                disabled={busy}
                onChange={(e) => changeDocument(Number(e.target.value))}
              >
                {documents.map((item) => (
                  <option key={item.id} value={item.id}>{item.originalFileName}</option>
                ))}
              </select>

              {selectedDocument && (
                <div className="tutor-document-info">
                  <span className="tutor-pdf-icon">PDF</span>
                  <div>
                    <strong>{selectedDocument.originalFileName}</strong>
                    <p>{(selectedDocument.sizeBytes / 1024).toFixed(1)} KB</p>
                  </div>
                  <span className={`tutor-status ${selectedDocument.status.toLowerCase() === "ready" ? "is-ready" : ""}`}>{selectedDocument.status}</span>
                </div>
              )}

              <a href={getDocumentFileUrl(documentId!)} target="_blank" rel="noreferrer" className="tutor-outline-btn">↗ Mở tài liệu PDF</a>
              <button type="button" className="tutor-index-btn" onClick={handleIndex} disabled={busy || !documentId}>
                {indexing ? "Đang xử lý PDF…" : "↻ Trích xuất & lập chỉ mục PDF"}
              </button>
              <p className="tutor-hint">Thực hiện xử lý trước khi hỏi nếu tài liệu chưa có trạng thái <strong>Ready</strong>. Xử lý lại sẽ thay thế chunks cũ của tài liệu này.</p>
            </>
          )}
        </aside>

        <div className="tutor-card tutor-conversation">
          <div className="tutor-card-header">
            <span className="tutor-section-tag">02 / TRỢ LÝ HỌC TẬP</span>
            <h2>{mode === "ask" ? "Hỏi đáp theo tài liệu" : "Tóm tắt tài liệu PDF"}</h2>
            <p>{mode === "ask"
              ? "Gia sư ưu tiên nội dung PDF đã chọn, không phải chatbot kiến thức chung."
              : "Tạo bản tóm tắt kiến thức từ các đoạn văn bản đã được lập chỉ mục."}</p>
          </div>

          <div className="tutor-mode-tabs" role="group" aria-label="Chọn tính năng AI">
            <button type="button" className={mode === "ask" ? "is-active" : ""} disabled={busy} onClick={() => changeMode("ask")}>✦ Hỏi đáp</button>
            <button type="button" className={mode === "summary" ? "is-active" : ""} disabled={busy} onClick={() => changeMode("summary")}>▤ Tóm tắt PDF</button>
          </div>

          {error && <div className="tutor-alert is-error" role="alert">{error}</div>}
          {notice && <div className="tutor-alert is-success" role="status">{notice}</div>}

          {mode === "ask" && !answer && !asking && (
            <div className="tutor-welcome">
              <div className="tutor-sparkle">✦</div>
              <h3>Bắt đầu khám phá kiến thức</h3>
              <p>Bạn có thể thử một trong các câu hỏi gợi ý bên dưới.</p>
              <div className="tutor-suggestions">
                {suggestedQuestions.map((item) => (
                  <button type="button" key={item} onClick={() => setQuestion(item)} disabled={busy || !documentId}>{item} <span>↗</span></button>
                ))}
              </div>
            </div>
          )}

          {mode === "ask" && asking && (
            <div className="tutor-welcome" role="status" aria-live="polite">
              <div className="tutor-sparkle is-loading">✦</div>
              <h3>Đang đọc tài liệu và tạo câu trả lời…</h3>
              <p>API có thể cần một chút thời gian để phản hồi.</p>
            </div>
          )}

          {mode === "ask" && answer && (
            <div className="tutor-result" aria-live="polite">
              <div className="tutor-result-label">✦ GIA SƯ AI TRẢ LỜI</div>
              <p className="tutor-answer-text">{answer.answer}</p>
              <div className="tutor-sources">
                <h3>Đoạn tài liệu đã được dùng làm ngữ cảnh</h3>
                {answer.sources.length ? (
                  <ul>
                    {answer.sources.map((source, i) => (
                      <li key={`${source.pageNumber}-${source.chunkIndex}-${i}`}>
                        <div className="tutor-source-top">
                          <span>Trang {source.pageNumber} · Đoạn {source.chunkIndex + 1}</span>
                          <a href={getPdfAtPage(documentId!, source.pageNumber)} target="_blank" rel="noreferrer">Xem nguồn ↗</a>
                        </div>
                        <p>{source.excerpt}</p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="tutor-muted">Không tìm thấy đoạn văn bản phù hợp với câu hỏi này.</p>}
              </div>
            </div>
          )}

          {mode === "summary" && (
            <div className="tutor-summary-area">
              <label className="tutor-label" htmlFor="tutor-summary-level">Mức độ chi tiết</label>
              <select
                id="tutor-summary-level"
                value={summaryLevel}
                onChange={(e) => setSummaryLevel(e.target.value as "short" | "detailed")}
                disabled={busy}
              >
                <option value="short">Ngắn gọn – các ý chính</option>
                <option value="detailed">Chi tiết – nội dung cần ôn</option>
              </select>
              <button type="button" className="tutor-summary-btn" onClick={handleSummarize} disabled={busy || !documentId}>
                {summarizing ? "Đang tạo tóm tắt…" : "✦ Tóm tắt tài liệu đã chọn"}
              </button>
              {summarizing && <p className="tutor-muted" role="status">AI đang tạo bản tóm tắt từ các đoạn nội dung đã chọn…</p>}
              {!summary && !summarizing && <div className="tutor-welcome tutor-summary-welcome">
                <div className="tutor-sparkle">▤</div>
                <h3>Biến PDF thành ghi chú học tập</h3>
                <p>Nếu tài liệu chưa ở trạng thái Ready, hãy lập chỉ mục trước. Bản tóm tắt này chưa được lưu vào MySQL.</p>
              </div>}
              {summary && (
                <div className="tutor-result" aria-live="polite">
                  <div className="tutor-result-label">✦ BẢN TÓM TẮT</div>
                  {summary.coverage.isPartial && <div className="tutor-alert is-warning" role="status">
                    Tóm tắt một phần: dùng {summary.coverage.sampledChunks}/{summary.coverage.totalChunks} đoạn được lập chỉ mục. Không xem đây là tóm tắt đầy đủ mọi trang.
                  </div>}
                  <p className="tutor-answer-text">{summary.summary}</p>
                  <p className="tutor-coverage-info">{summary.coverage.note}</p>
                  <div className="tutor-sources">
                    <h3>Các đoạn PDF đã cung cấp cho AI</h3>
                    <ul>
                      {summary.sources.map((source, i) => (
                        <li key={`${source.pageNumber}-${source.chunkIndex}-${i}`}>
                          <div className="tutor-source-top">
                            <span>Trang {source.pageNumber} · Đoạn {source.chunkIndex + 1}</span>
                            <a href={getPdfAtPage(documentId!, source.pageNumber)} target="_blank" rel="noreferrer">Mở PDF ↗</a>
                          </div>
                          <p>{source.excerpt}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === "ask" && <form className="tutor-ask-form" onSubmit={handleAsk}>
            <label className="tutor-label" htmlFor="tutor-question">Câu hỏi của bạn</label>
            <textarea
              id="tutor-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ví dụ: Giải thích khái niệm được đề cập ở chương 1…"
              disabled={busy || !documentId}
            />
            <div className="tutor-form-bottom">
              <span>{question.length}/500 ký tự</span>
              <button type="submit" disabled={busy || !documentId || question.trim().length < 3}>
                {asking ? "Đang trả lời…" : "Gửi câu hỏi →"}
              </button>
            </div>
          </form>}
        </div>
      </div>
      <p className="tutor-footnote">Giai đoạn Development: các nguồn trên là chunks Backend cung cấp, chưa phải trích dẫn đã kiểm định tự động. Tóm tắt dài sử dụng lấy mẫu, không bảo đảm bao phủ toàn bộ PDF. API OpenAI cần hoạt động thành công.</p>
    </section>
  );
}
