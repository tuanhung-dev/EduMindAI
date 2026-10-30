import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getDocuments, getDocumentFileUrl, type DocumentItem } from "../services/documentService";
import {
  generateQuiz, getQuiz, listQuizzes, listQuizAttempts, startQuizAttempt,
  type QuizDetail, type QuizDifficulty, type QuizListItem, type QuizAttemptSummary,
} from "../services/quizService";
import "./QuizzesPage.css";

const difficultyNames: Record<QuizDifficulty, string> = {
  easy: "Cơ bản", medium: "Trung bình", hard: "Nâng cao",
};

export default function QuizzesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [count, setCount] = useState<5 | 10>(5);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
  const [topic, setTopic] = useState("");
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [preview, setPreview] = useState<QuizDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [starting, setStarting] = useState(false);
  const [attempts, setAttempts] = useState<QuizAttemptSummary[]>([]);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([getDocuments(), listQuizzes()])
      .then(([docs, items]) => {
        if (!active) return;
        setDocuments(docs);
        setQuizzes(items);
        const requested = Number(searchParams.get("documentId"));
        const valid = Number.isSafeInteger(requested) && requested > 0 && docs.some((d) => d.id === requested);
        setSelectedId(valid ? requested : (docs[0]?.id ?? null));
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Không tải được danh sách tài liệu hoặc đề thi.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Chỉ lấy tham số ban đầu; lựa chọn sau đó do người dùng kiểm soát.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!preview) return;
    let active = true;
    listQuizAttempts(preview.id)
      .then((items) => { if (active) { setAttempts(items); setHistoryError(""); } })
      .catch((e: unknown) => { if (active) { setAttempts([]); setHistoryError(e instanceof Error ? e.message : "Không tải được lịch sử làm bài."); } });
    return () => { active = false; };
  }, [preview]);

  const selectedDocument = documents.find((d) => d.id === selectedId);
  const busy = generating || opening || loading || starting;

  async function handleStart() {
    if (!preview || busy) return;
    setError(""); setNotice(""); setStarting(true);
    try {
      const started = await startQuizAttempt(preview.id);
      navigate(`/app/attempts/${started.attemptId}/take`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không bắt đầu được bài thi.");
      setStarting(false);
    }
  }

  async function handleGenerate() {
    if (!selectedId || busy) return;
    setError(""); setNotice(""); setHistoryError(""); setAttempts([]); setGenerating(true);
    try {
      const created = await generateQuiz(selectedId, count, difficulty, topic.trim());
      setNotice(`${created.message} Đề số #${created.quizId} đã được tạo.`);
      try {
        const [items, detail] = await Promise.all([listQuizzes(), getQuiz(created.quizId)]);
        setQuizzes(items);
        setPreview(detail);
      } catch (err) {
        // Không sinh lại đề chỉ vì lần đọc danh sách bị lỗi.
        setError(`Đề #${created.quizId} đã được lưu, nhưng chưa tải được bản xem trước: ${err instanceof Error ? err.message : "Lỗi kết nối."}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI chưa tạo được đề trắc nghiệm.");
    } finally { setGenerating(false); }
  }

  async function handleOpen(id: number) {
    if (busy) return;
    setError(""); setNotice(""); setHistoryError(""); setAttempts([]); setOpening(true);
    try { setPreview(await getQuiz(id)); }
    catch (err) { setError(err instanceof Error ? err.message : "Không mở được đề."); }
    finally { setOpening(false); }
  }

  const visibleItems = selectedId ? quizzes.filter((q) => q.documentId === selectedId) : quizzes;
  const visibleAttempts = preview ? attempts.filter((a) => a.quizId === preview.id) : [];

  return (
    <section className="quizzes-page">
      <div className="quizzes-header">
        <div>
          <span className="quizzes-eyebrow">EDUMIND AI / BƯỚC 22</span>
          <h1>Luyện thi AI từ tài liệu PDF</h1>
          <p>Tạo đề từ tài liệu PDF, bắt đầu làm bài, nộp đáp án và xem kết quả chấm điểm.</p>
        </div>
        <span className="quizzes-tag">Bản demo</span>
      </div>

      {error && <p role="alert" className="quizzes-alert quizzes-error">{error}</p>}
      {notice && <p role="status" className="quizzes-alert quizzes-notice">{notice}</p>}

      <div className="quizzes-top">
        <div className="quizzes-card quizzes-generator">
          <span className="quizzes-kicker">01 / TẠO ĐỀ</span>
          <h2>Thiết lập bài trắc nghiệm</h2>
          <label htmlFor="quiz-document">Tài liệu nguồn</label>
          <select id="quiz-document" disabled={busy || !documents.length} value={selectedId ?? ""}
            onChange={(e) => { setSelectedId(Number(e.target.value)); setPreview(null); setAttempts([]); setHistoryError(""); setNotice(""); }}>
            {documents.map((d) => <option value={d.id} key={d.id}>{d.originalFileName}</option>)}
          </select>
          {!loading && documents.length === 0 && <p className="quizzes-hint">Kho tài liệu trống. <Link to="/app/documents">Tải PDF lên</Link> để bắt đầu.</p>}
          {selectedDocument && <p className="quizzes-hint">Trạng thái PDF: <b>{selectedDocument.status}</b>. Nếu chưa lập chỉ mục, hãy <Link to={`/app/ai-tutor?documentId=${selectedDocument.id}`}>xử lý PDF tại Gia sư AI</Link>.</p>}
          <label htmlFor="quiz-topic">Chủ đề muốn ôn tập (không bắt buộc)</label>
          <input id="quiz-topic" type="text" maxLength={100} disabled={busy}
            value={topic} onChange={(e) => setTopic(e.target.value)}
            placeholder="Ví dụ: khóa chính, SQL JOIN, chuẩn hóa dữ liệu" />
          <p className="quizzes-hint">Để trống để tạo đề tổng quan. Nếu chọn chủ đề, AI sẽ ưu tiên phần PDF phù hợp.</p>
          <label htmlFor="quiz-count">Số lượng câu hỏi</label>
          <select id="quiz-count" disabled={busy} value={count} onChange={(e) => setCount(Number(e.target.value) as 5 | 10)}>
            <option value={5}>5 câu – thử nhanh</option><option value={10}>10 câu – ôn tập</option>
          </select>
          <label htmlFor="quiz-difficulty">Độ khó</label>
          <select id="quiz-difficulty" disabled={busy} value={difficulty} onChange={(e) => setDifficulty(e.target.value as QuizDifficulty)}>
            <option value="easy">Cơ bản</option><option value="medium">Trung bình</option><option value="hard">Nâng cao</option>
          </select>
          <button type="button" className="quizzes-primary" disabled={busy || !selectedId} onClick={handleGenerate}>
            {generating ? "Đang sinh và lưu đề…" : "✦ Tạo đề trắc nghiệm"}
          </button>
          <p className="quizzes-hint">Đang dùng Ollama cục bộ: không mất phí API theo lượt, nhưng việc tạo đề có thể mất vài phút. Hãy thử 5 câu trước trên máy 12 GB RAM.</p>
        </div>

        <div className="quizzes-card quizzes-saved">
          <div className="quizzes-section-head"><div><span className="quizzes-kicker">02 / KHO ĐỀ</span><h2>Đề đã lưu</h2></div><span className="quizzes-count">{visibleItems.length} đề</span></div>
          {loading ? <p className="quizzes-muted">Đang tải đề…</p> : visibleItems.length ? (
            <ul className="quizzes-saved-list">
              {visibleItems.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => handleOpen(item.id)} disabled={busy} className={preview?.id === item.id ? "selected" : ""}>
                    <span className="quizzes-saved-icon">✎</span>
                    <span className="quizzes-saved-detail"><strong>{item.title}</strong><small>{item.questionCount} câu · {difficultyNames[item.difficulty] ?? item.difficulty}{item.isPartialSource ? " · Một phần PDF" : ""}</small></span>
                    <span aria-hidden="true">›</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <div className="quizzes-empty">Chưa có đề nào cho tài liệu này. Hãy tạo đề đầu tiên.</div>}
        </div>
      </div>

      <div className="quizzes-card quizzes-preview">
        <div className="quizzes-section-head"><div><span className="quizzes-kicker">03 / XEM TRƯỚC</span><h2>{preview ? preview.title : "Nội dung bộ đề"}</h2></div>{preview && <span className="quizzes-count">#{preview.id}</span>}</div>
        {opening && <p className="quizzes-muted" role="status">Đang mở nội dung đề…</p>}
        {!preview && !opening && <div className="quizzes-empty">Chọn đề trong Kho đề hoặc tạo đề mới để xem câu hỏi.</div>}
        {preview && (
          <>
            {preview.isPartialSource && <p className="quizzes-alert quizzes-warning">Đề được tạo từ một phần các đoạn tài liệu được lấy mẫu, không bảo đảm bao quát toàn bộ PDF.</p>}
            <p className="quizzes-muted">Đáp án đúng và lời giải được giữ ở Backend cho đến khi bạn nộp bài.</p>
            <div className="quizzes-start-panel">
              <button type="button" onClick={handleStart} className="quizzes-primary" disabled={busy}>
                {starting ? "Đang mở bài…" : `▶ Bắt đầu làm ${preview.questions.length} câu`}
              </button>
              <span>Mỗi lần bắt đầu sẽ tạo một lượt thi mới và được lưu trong MySQL.</span>
            </div>
            <div className="quizzes-history">
              <h3>Lịch sử làm bài của đề #{preview.id}</h3>
              {historyError && <p role="alert" className="quizzes-alert quizzes-error">{historyError}</p>}
              {visibleAttempts.length === 0 && !historyError && <p className="quizzes-muted">Chưa có lượt làm bài nào.</p>}
              {visibleAttempts.length > 0 && <ul>
                {visibleAttempts.map((attempt) => <li key={attempt.id}>
                  <span>#{attempt.id} · {new Date(attempt.startedAtUtc).toLocaleString("vi-VN")}</span>
                  <strong>{attempt.submittedAtUtc ? `${attempt.scorePercent?.toFixed(2) ?? "0.00"}% · ${attempt.correctCount}/${attempt.totalQuestions} đúng` : "Chưa nộp"}</strong>
                  <Link to={attempt.submittedAtUtc ? `/app/results/${attempt.id}` : `/app/attempts/${attempt.id}/take`}>
                    {attempt.submittedAtUtc ? "Xem kết quả" : "Tiếp tục"}
                  </Link>
                </li>)}
              </ul>}
            </div>
            <div className="quizzes-questions">
              {preview.questions.map((q) => (
                <article className="quizzes-question" key={q.id}>
                  <h3>Câu {q.position}. {q.content}</h3>
                  <div className="quizzes-options">
                    {([ ["A", q.optionA], ["B", q.optionB], ["C", q.optionC], ["D", q.optionD] ] as const).map(([letter, text]) => (
                      <div key={letter}><span className="quizzes-letter">{letter}</span><span>{text}</span></div>
                    ))}
                  </div>
                  <a className="quizzes-source" href={`${getDocumentFileUrl(preview.documentId)}#page=${Math.max(1, q.sourcePageNumber)}`} target="_blank" rel="noreferrer">↗ Xem trang PDF nguồn: {q.sourcePageNumber}</a>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
