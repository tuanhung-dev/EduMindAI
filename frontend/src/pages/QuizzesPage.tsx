import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getDocuments, getDocumentFileUrl, type DocumentItem } from "../services/documentService";
import {
  generateQuiz, getQuiz, listQuizzes, listQuizAttempts, startQuizAttempt,
  type QuizDetail, type QuizDifficulty, type QuizListItem, type QuizAttemptSummary,
} from "../services/quizService";
import "./QuizzesPage.css";

type SortMode = "newest" | "oldest" | "name";
type LibraryFilter = "selected" | "all";

const difficultyNames: Record<QuizDifficulty, string> = {
  easy: "Cơ bản", medium: "Trung bình", hard: "Nâng cao",
};

const normalize = (text: string) => text.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d").replace(/Đ/g, "D").toLocaleLowerCase("vi-VN");

const niceDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Không rõ ngày" : date.toLocaleDateString("vi-VN");
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
  const [attempts, setAttempts] = useState<QuizAttemptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [opening, setOpening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("selected");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [showQuestions, setShowQuestions] = useState(false);

  const busy = loading || generating || opening || starting;
  const selectedDocument = documents.find((doc) => doc.id === selectedId);
  const ready = selectedDocument?.status.toLowerCase() === "ready";
  const readyCount = documents.filter((doc) => doc.status.toLowerCase() === "ready").length;

  useEffect(() => {
    let active = true;
    Promise.allSettled([getDocuments(), listQuizzes()]).then(([docsResult, quizResult]) => {
      if (!active) return;
      if (docsResult.status === "fulfilled") {
        const docs = docsResult.value;
        setDocuments(docs);
        const param = searchParams.get("documentId");
        const requested = param && /^\d+$/.test(param) ? Number(param) : null;
        const found = docs.find((doc) => doc.id === requested);
        const firstReady = docs.find((doc) => doc.status.toLowerCase() === "ready");
        setSelectedId(found?.id ?? firstReady?.id ?? docs[0]?.id ?? null);
      } else {
        setError("Không tải được tài liệu. Bạn vẫn có thể xem các đề đã lưu.");
      }
      if (quizResult.status === "fulfilled") {
        setQuizzes(quizResult.value);
      } else {
        setError((old) => old || "Không tải được kho đề. Hãy thử làm mới.");
      }
      setLoading(false);
    });
    return () => { active = false; };
    // Chỉ dùng documentId từ URL khi mở trang lần đầu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!preview) {
      return;
    }
    let active = true;
    listQuizAttempts(preview.id)
      .then((items) => { if (active) setAttempts(items); })
      .catch((e: unknown) => {
        if (active) {
          setAttempts([]);
          setHistoryError(e instanceof Error ? e.message : "Không tải được lịch sử làm bài.");
        }
      })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [preview]);

  const visibleQuizzes = useMemo(() => {
    const search = normalize(librarySearch.trim());
    return quizzes.filter((quiz) => {
      const matchesDocument = libraryFilter === "all" || !selectedId || quiz.documentId === selectedId;
      return matchesDocument && (!search || normalize(`${quiz.title} ${quiz.documentName}`).includes(search));
    }).sort((a, b) => {
      if (sortMode === "name") return a.title.localeCompare(b.title, "vi-VN");
      const delta = (Date.parse(b.createdAtUtc) || 0) - (Date.parse(a.createdAtUtc) || 0);
      return sortMode === "newest" ? delta : -delta;
    });
  }, [quizzes, librarySearch, libraryFilter, selectedId, sortMode]);

  async function refreshQuizzes() {
    if (busy) return;
    setOpening(true);
    setError("");
    try { setQuizzes(await listQuizzes()); }
    catch (e) { setError(e instanceof Error ? e.message : "Không làm mới được danh sách đề."); }
    finally { setOpening(false); }
  }

  async function handleGenerate() {
    if (!selectedId || !ready || busy) return;
    setError(""); setNotice(""); setGenerating(true);
    try {
      const created = await generateQuiz(selectedId, count, difficulty, topic.trim());
      setNotice(`Đã tạo đề #${created.quizId}. Bạn có thể xem trước hoặc bắt đầu làm bài.`);
      try {
        const [items, detail] = await Promise.all([listQuizzes(), getQuiz(created.quizId)]);
        setQuizzes(items);
        setHistoryLoading(true);
        setHistoryError("");
        setPreview(detail);
        setAttempts([]);
        setShowQuestions(false);
      } catch (e) {
        setError(`Đề #${created.quizId} đã được tạo, nhưng chưa tải được bản xem trước: ${e instanceof Error ? e.message : "Lỗi kết nối."}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gia sư AI chưa tạo được đề. Hãy thử lại.");
    } finally { setGenerating(false); }
  }

  async function handleOpen(id: number) {
    if (busy) return;
    setOpening(true); setError(""); setNotice(""); setHistoryError("");
    try {
      const detail = await getQuiz(id);
      setHistoryLoading(true);
      setHistoryError("");
      setPreview(detail);
      setAttempts([]);
      setShowQuestions(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không mở được bộ đề.");
    } finally { setOpening(false); }
  }

  async function handleStart() {
    if (!preview || busy) return;
    setStarting(true); setError("");
    try {
      const result = await startQuizAttempt(preview.id);
      navigate(`/app/attempts/${result.attemptId}/take`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể bắt đầu bài thi.");
      setStarting(false);
    }
  }

  return (
    <div className="eqz-page">
      <header className="eqz-hero">
        <div className="eqz-hero-copy">
          <span className="eqz-overline eqz-overline-light">EDUMIND AI · LUYỆN THI THÔNG MINH</span>
          <h1>Ôn tập chủ động.<br /><span>Tự tin với kiến thức.</span></h1>
          <p>Tạo bộ câu hỏi từ Word/PDF đã xử lý, luyện tập theo độ khó và xem lời giải sau khi nộp bài.</p>
          <div className="eqz-hero-actions">
            <a href="#eqz-generator" className="eqz-button eqz-button-light">✦ Tạo đề với AI <span aria-hidden="true">↓</span></a>
            <a href="#eqz-library" className="eqz-button eqz-button-outline">Xem kho đề <span aria-hidden="true">↗</span></a>
          </div>
          <div className="eqz-hero-tags"><span>✓ Từ tài liệu của bạn</span><span>✓ 3 mức độ khó</span><span>✓ Chấm điểm & lời giải</span></div>
        </div>
        <div className="eqz-hero-art" aria-hidden="true">
          <div className="eqz-art-card"><small>01 · KIẾN THỨC</small><strong>Đọc tài liệu</strong><span>PDF / DOCX ✓</span></div>
          <div className="eqz-art-line" />
          <div className="eqz-art-card eqz-art-card-accent"><small>02 · LUYỆN TẬP</small><strong>AI tạo câu hỏi</strong><span>A · B · C · D</span></div>
          <div className="eqz-art-line" />
          <div className="eqz-art-card"><small>03 · CẢI THIỆN</small><strong>Xem kết quả</strong><span>Phân tích câu sai ↗</span></div>
        </div>
      </header>

      <section className="eqz-stats" aria-label="Tổng quan luyện thi">
        <div className="eqz-stat"><span className="eqz-stat-icon">▤</span><div><small>Tài liệu sẵn sàng</small><strong>{loading ? "…" : readyCount}</strong><span>Có thể dùng tạo đề</span></div></div>
        <div className="eqz-stat"><span className="eqz-stat-icon">◈</span><div><small>Bộ đề đã tạo</small><strong>{loading ? "…" : quizzes.length}</strong><span>Đang lưu trên hệ thống</span></div></div>
        <div className="eqz-stat"><span className="eqz-stat-icon">✦</span><div><small>Mức độ luyện tập</small><strong>03</strong><span>Cơ bản · Trung bình · Nâng cao</span></div></div>
      </section>

      {error && <div role="alert" className="eqz-alert eqz-alert-error"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Đóng lỗi">×</button></div>}
      {notice && <div role="status" className="eqz-alert eqz-alert-success"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Đóng thông báo">×</button></div>}

      <div className="eqz-workspace">
        <section className="eqz-panel eqz-generator" id="eqz-generator" aria-labelledby="eqz-generator-title">
          <div className="eqz-panel-head"><div><span className="eqz-overline">01 / TẠO ĐỀ MỚI</span><h2 id="eqz-generator-title">Thiết lập bài luyện thi</h2><p>Chọn nguồn kiến thức và điều chỉnh đề theo mục tiêu học.</p></div><span className="eqz-panel-icon">✦</span></div>
          <div className="eqz-field"><label htmlFor="eqz-document">Tài liệu dùng để tạo đề <span>*</span></label>
            <select id="eqz-document" disabled={busy || documents.length === 0} value={selectedId ?? ""} onChange={(e) => { setSelectedId(Number(e.target.value)); setPreview(null); setAttempts([]); setNotice(""); }}>
              {documents.length === 0 && <option value="">Chưa có tài liệu</option>}
              {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.originalFileName}{doc.status.toLowerCase() === "ready" ? " ✓" : " · Chưa sẵn sàng"}</option>)}
            </select>
          </div>
          {selectedDocument ? <div className={`eqz-document-note ${ready ? "is-ready" : "is-pending"}`}>
            <span aria-hidden="true">{ready ? "✓" : "!"}</span><div><strong>{ready ? "Tài liệu đã sẵn sàng" : "Tài liệu cần xử lý trước"}</strong><p>{ready ? "Bạn có thể tạo đề ngay từ nội dung tài liệu này." : "Hãy xử lý tài liệu tại Kho tài liệu hoặc Gia sư AI."}</p></div>
            {!ready && <Link to={`/app/ai-tutor?documentId=${selectedDocument.id}`}>Xử lý ↗</Link>}
          </div> : !loading && <div className="eqz-document-note is-pending"><span>!</span><div><strong>Chưa có tài liệu</strong><p>Hãy tải lên PDF/DOCX trước khi tạo đề.</p></div><Link to="/app/documents">Tải lên ↗</Link></div>}
          <div className="eqz-field"><label htmlFor="eqz-topic">Chủ đề trọng tâm <span className="eqz-optional">(không bắt buộc)</span></label>
            <input id="eqz-topic" value={topic} maxLength={100} disabled={busy} onChange={(e) => setTopic(e.target.value)} placeholder="Ví dụ: câu lệnh SQL JOIN, mạng máy tính..." />
            <small>Để trống để tạo câu hỏi bao quát nội dung được truy xuất.</small>
          </div>
          <div className="eqz-field"><span className="eqz-field-title">Số câu hỏi</span><div role="group" aria-label="Số câu hỏi" className="eqz-segments">
            {([5, 10] as const).map((n) => <button key={n} type="button" disabled={busy} aria-pressed={count === n} className={count === n ? "selected" : ""} onClick={() => setCount(n)}>{n} câu <small>{n === 5 ? "Thử nhanh" : "Ôn tập"}</small></button>)}
          </div></div>
          <div className="eqz-field"><span className="eqz-field-title">Độ khó</span><div role="group" aria-label="Chọn độ khó" className="eqz-segments eqz-segments-3">
            {(["easy", "medium", "hard"] as const).map((value) => <button key={value} type="button" disabled={busy} aria-pressed={difficulty === value} className={difficulty === value ? "selected" : ""} onClick={() => setDifficulty(value)}>{difficultyNames[value]}</button>)}
          </div></div>
          <div className="eqz-generator-bottom"><button type="button" className="eqz-button eqz-button-primary" disabled={!ready || busy} onClick={() => void handleGenerate()}>{generating ? "✦ AI đang tạo đề..." : "✦ Tạo đề luyện thi"}</button>
            <p>{generating ? "Quá trình tạo đề có thể cần thời gian. Không bấm gửi lại." : "Tạo đề sử dụng AI đã cấu hình trên máy chủ. Nội dung có thể chưa hoàn hảo, hãy kiểm tra nguồn."}</p></div>
        </section>

        <section className="eqz-panel eqz-library" id="eqz-library" aria-labelledby="eqz-library-title">
          <div className="eqz-panel-head"><div><span className="eqz-overline">02 / ĐỀ ĐÃ TẠO</span><h2 id="eqz-library-title">Thư viện bộ đề</h2><p>Mở đề, xem nội dung hoặc tiếp tục lượt làm bài.</p></div><span className="eqz-total">{visibleQuizzes.length} đề</span></div>
          <div className="eqz-library-toolbar">
            <label className="eqz-search"><span className="eqz-visually-hidden">Tìm kiếm đề thi</span><span aria-hidden="true">⌕</span><input type="search" value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} placeholder="Tìm theo tên đề, tài liệu..." /></label>
            <label className="eqz-sort"><span className="eqz-visually-hidden">Sắp xếp đề</span><select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}><option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="name">Tên A–Z</option></select></label>
          </div>
          <div className="eqz-library-tabs" role="group" aria-label="Lọc đề theo tài liệu">
            <button type="button" aria-pressed={libraryFilter === "selected"} className={libraryFilter === "selected" ? "active" : ""} onClick={() => setLibraryFilter("selected")}>Tài liệu đang chọn</button>
            <button type="button" aria-pressed={libraryFilter === "all"} className={libraryFilter === "all" ? "active" : ""} onClick={() => setLibraryFilter("all")}>Tất cả đề</button>
            <button type="button" className="eqz-reload" onClick={() => void refreshQuizzes()} disabled={busy} aria-label="Làm mới thư viện đề" title="Làm mới">↻</button>
          </div>
          {loading ? <div className="eqz-empty" role="status">Đang tải thư viện bộ đề...</div> : visibleQuizzes.length === 0 ? <div className="eqz-empty"><span aria-hidden="true">▤</span><strong>Chưa có đề phù hợp</strong><p>Hãy tạo bộ đề đầu tiên hoặc đổi bộ lọc tìm kiếm.</p></div> : <ul className="eqz-quiz-list">{visibleQuizzes.map((item) => <li key={item.id}>
            <button type="button" disabled={busy} onClick={() => void handleOpen(item.id)} className={preview?.id === item.id ? "selected" : ""} aria-pressed={preview?.id === item.id}>
              <span className="eqz-list-icon" aria-hidden="true">▤</span><span className="eqz-list-content"><strong>{item.title}</strong><small>{item.documentName}</small><span className="eqz-list-meta"><span>{item.questionCount} câu</span><span>{difficultyNames[item.difficulty] ?? item.difficulty}</span><span>{niceDate(item.createdAtUtc)}</span>{item.isPartialSource && <span>Nguồn một phần</span>}</span></span><span className="eqz-list-arrow" aria-hidden="true">↗</span>
            </button>
          </li>)}</ul>}
        </section>
      </div>

      <section className="eqz-panel eqz-preview" aria-labelledby="eqz-preview-title">
        <div className="eqz-panel-head"><div><span className="eqz-overline">03 / XEM TRƯỚC & LÀM BÀI</span><h2 id="eqz-preview-title">{preview?.title ?? "Chi tiết bộ đề"}</h2><p>{preview ? `${preview.questions.length} câu · ${difficultyNames[preview.difficulty]}` : "Chọn bộ đề trong thư viện để xem chi tiết."}</p></div>{preview && <span className="eqz-total">Đề #{preview.id}</span>}</div>
        {opening && <div className="eqz-empty" role="status">Đang mở bộ đề...</div>}
        {!preview && !opening && <div className="eqz-empty eqz-empty-wide"><span aria-hidden="true">✦</span><strong>Chọn đề để bắt đầu</strong><p>Đề mới tạo hoặc đề đã lưu sẽ xuất hiện tại đây. Bạn có thể xem câu hỏi trước khi bắt đầu lượt làm bài mới.</p></div>}
        {preview && <>
          {preview.isPartialSource && <div className="eqz-alert eqz-alert-warning">Đề này chỉ được tạo từ một phần nội dung tài liệu. Bạn nên đối chiếu lại với nguồn gốc.</div>}
          <div className="eqz-preview-actions"><div><strong>Sẵn sàng luyện tập?</strong><p>Đáp án đúng và lời giải chỉ hiển thị sau khi nộp bài.</p></div><button type="button" className="eqz-button eqz-button-primary" disabled={busy} onClick={() => void handleStart()}>{starting ? "Đang mở bài..." : "▶ Bắt đầu làm bài"}</button></div>
          <div className="eqz-preview-block"><div className="eqz-block-head"><h3>Lịch sử các lượt làm bài</h3><span>{attempts.length} lượt</span></div>
            {historyError && <p className="eqz-alert eqz-alert-error" role="alert">{historyError}</p>}
            {historyLoading ? <p className="eqz-subtle" role="status">Đang tải lịch sử...</p> : attempts.length === 0 && !historyError ? <p className="eqz-subtle">Chưa có lượt làm bài nào cho đề này.</p> : <ul className="eqz-attempt-list">{attempts.map((item) => <li key={item.id}>
              <span><strong>{item.submittedAtUtc ? `Đã nộp · ${item.scorePercent?.toFixed(1) ?? "—"}%` : "Chưa nộp"}</strong><small>{niceDate(item.startedAtUtc)} · {item.totalQuestions} câu</small></span><Link to={item.submittedAtUtc ? `/app/results/${item.id}` : `/app/attempts/${item.id}/take`}>{item.submittedAtUtc ? "Xem kết quả ↗" : "Tiếp tục ↗"}</Link>
            </li>)}</ul>}
          </div>
          <div className="eqz-preview-block"><div className="eqz-block-head"><h3>Xem trước câu hỏi</h3><button type="button" className="eqz-show-btn" aria-expanded={showQuestions} onClick={() => setShowQuestions((old) => !old)}>{showQuestions ? "Thu gọn" : `Hiển thị ${preview.questions.length} câu`} {showQuestions ? "⌃" : "⌄"}</button></div>
            {showQuestions && <div className="eqz-questions">{preview.questions.map((q) => <article className="eqz-question" key={q.id}>
              <h4>Câu {q.position}. {q.content}</h4><div className="eqz-options">{([["A", q.optionA], ["B", q.optionB], ["C", q.optionC], ["D", q.optionD]] as const).map(([letter, text]) => <div key={letter}><span>{letter}</span>{text}</div>)}</div>
              <a href={`${getDocumentFileUrl(preview.documentId)}${preview.documentName.toLowerCase().endsWith(".pdf") ? `#page=${Math.max(1, q.sourcePageNumber)}` : ""}`} target="_blank" rel="noreferrer">↗ {preview.documentName.toLowerCase().endsWith(".pdf") ? `Đối chiếu PDF trang ${q.sourcePageNumber}` : "Mở tài liệu nguồn"}</a>
            </article>)}</div>}
          </div>
        </>}
      </section>

      <section className="eqz-guide" aria-labelledby="eqz-guide-title"><div><span className="eqz-overline">HỌC HIỆU QUẢ HƠN</span><h2 id="eqz-guide-title">Luyện thi theo 3 bước</h2></div><ol><li><span>01</span><strong>Chọn tài liệu</strong><small>Chuẩn bị Word/PDF đã xử lý</small></li><li><span>02</span><strong>Tạo & làm đề</strong><small>Chọn chủ đề, số câu và độ khó</small></li><li><span>03</span><strong>Ôn câu sai</strong><small>Xem lời giải và quay lại nguồn</small></li></ol></section>
    </div>
  );
}
