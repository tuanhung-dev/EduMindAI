import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getDocuments, getDocumentFileUrl, type DocumentItem } from "../services/documentService";
import { getLearningProgress, type LearningProgress, type ScoreEntry } from "../services/learningProgressService";
import "./LearningProgressPage.css";

type ScoreFilter = "all" | "goal" | "review";
type SortMode = "newest" | "oldest" | "highest";

const clamp = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));
const percent = (value: number) => `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value)}%`;
function displayTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Không rõ ngày" : date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}
function dateValue(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
function readTarget(userId: string | undefined): number {
  if (!userId) return 80;
  try {
    const raw = Number(window.localStorage.getItem(`edumind:score-goal:${userId}`));
    return [60, 70, 80, 90].includes(raw) ? raw : 80;
  } catch { return 80; }
}

function TrendChart({ scores, target }: { scores: ScoreEntry[]; target: number }) {
  if (!scores.length) return <div className="erp-empty-small">Chưa đủ bài đã nộp để vẽ biểu đồ.</div>;
  const entries = [...scores].sort((a, b) => dateValue(a.submittedAtUtc) - dateValue(b.submittedAtUtc));
  return (
    <div className="erp-chart-scroll">
      <div className="erp-chart" aria-label={`Biểu đồ điểm ${entries.length} bài gần đây, mục tiêu ${target}%`}>
        <div className="erp-chart-axis" aria-hidden="true"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
        <div className="erp-chart-grid">
          <div className="erp-chart-target" style={{ bottom: `${24 + target * 1.8}px` }} aria-hidden="true" />
          {entries.map((entry, index) => (
            <Link
              key={entry.attemptId} to={`/app/results/${entry.attemptId}`}
              className="erp-bar" title={`${entry.quizTitle}: ${percent(entry.scorePercent)} · ${displayTime(entry.submittedAtUtc)}`}
              aria-label={`Lượt ${index + 1}: ${entry.quizTitle}, ${percent(entry.scorePercent)}. Xem lời giải`}
            >
              <strong>{Math.round(entry.scorePercent)}%</strong>
              <span className="erp-bar-track"><span className={entry.scorePercent >= target ? "met-goal" : ""} style={{ height: `${clamp(entry.scorePercent)}%` }} /></span>
              <small>#{index + 1}</small>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LearningProgressPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = Number(searchParams.get("documentId"));
  const documentId = Number.isSafeInteger(requested) && requested > 0 ? requested : null;
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [data, setData] = useState<LearningProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);
  const [goal, setGoal] = useState(() => readTarget(user?.id));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ScoreFilter>("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [showAllReviews, setShowAllReviews] = useState(false);

  const reload = useCallback(() => { setLoading(true); setReloadCount(i => i + 1); }, []);

  useEffect(() => {
    let live = true;
    getDocuments().then(items => { if (live) setDocuments(items); }).catch(() => { /* Dữ liệu bài nộp vẫn có thể tải riêng. */ });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    getLearningProgress(documentId ?? undefined)
      .then(value => { if (live) { setData(value); setError(""); } })
      .catch(reason => { if (live) { setData(null); setError(reason instanceof Error ? reason.message : "Không tải được kết quả luyện thi."); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [documentId, reloadCount]);

  function chooseDocument(value: string) {
    setLoading(true);
    setData(null);
    setQuery("");
    setFilter("all");
    setSearchParams(value ? { documentId: value } : {});
  }

  function changeGoal(value: number) {
    setGoal(value);
    if (user?.id) {
      try { window.localStorage.setItem(`edumind:score-goal:${user.id}`, String(value)); }
      catch { /* Không chặn thao tác nếu trình duyệt từ chối lưu. */ }
    }
  }

  const summary = data?.summary;
  const recent = useMemo(() => data?.recentAttempts ?? [], [data]);
  const visibleAttempts = useMemo(() => {
    const key = normalize(query.trim());
    return recent
      .filter(item => (filter === "all" || (filter === "goal" ? item.scorePercent >= goal : item.scorePercent < goal)) &&
        (!key || normalize(`${item.quizTitle} ${item.documentName}`).includes(key)))
      .sort((a, b) => sort === "highest" ? b.scorePercent - a.scorePercent : sort === "oldest" ? dateValue(a.submittedAtUtc) - dateValue(b.submittedAtUtc) : dateValue(b.submittedAtUtc) - dateValue(a.submittedAtUtc));
  }, [recent, query, filter, sort, goal]);

  const sortedTrend = useMemo(() => [...(data?.scoreTrend ?? [])].sort((a, b) => dateValue(a.submittedAtUtc) - dateValue(b.submittedAtUtc)), [data]);
  const last = sortedTrend.at(-1);
  const previous = sortedTrend.at(-2);
  const delta = last && previous ? last.scorePercent - previous.scorePercent : null;
  const reviews = data?.reviewPages ?? [];
  const visibleReviews = showAllReviews ? reviews : reviews.slice(0, 4);

  return (
    <div className="erp-page">
      <header className="erp-hero">
        <div>
          <span className="erp-eyebrow">EDUMIND AI · KẾT QUẢ LUYỆN THI</span>
          <h1>Hiểu điểm số.<br /><em>Tiến bộ sau mỗi bài.</em></h1>
          <p>Thống kê những lượt đã nộp, xem lời giải và xác định kiến thức cần ôn lại từ tài liệu học tập của bạn.</p>
          <div className="erp-hero-actions">
            <Link to="/app/quizzes" className="erp-hero-primary">◉ Tiếp tục luyện thi ↗</Link>
            <Link to="/app/study-plan" className="erp-hero-secondary">◇ Mở lộ trình học</Link>
          </div>
        </div>
        <div className="erp-hero-visual" aria-hidden="true"><span>▥</span><strong>{summary?.completedAttempts ?? "—"}</strong><small>Bài đã nộp</small></div>
      </header>

      <div className="erp-toolbar">
        <div className="erp-toolbar-field">
          <label htmlFor="erp-document">Tài liệu học tập</label>
          <select id="erp-document" value={documentId ?? ""} disabled={loading} onChange={event => chooseDocument(event.target.value)}>
            <option value="">Tất cả tài liệu</option>
            {documentId && !documents.some(doc => doc.id === documentId) && <option value={documentId}>Tài liệu #{documentId}</option>}
            {documents.map(doc => <option key={doc.id} value={doc.id}>{doc.originalFileName}</option>)}
          </select>
        </div>
        <div className="erp-toolbar-field erp-toolbar-goal">
          <label htmlFor="erp-goal">Mục tiêu điểm cá nhân</label>
          <select id="erp-goal" value={goal} onChange={event => changeGoal(Number(event.target.value))}>
            {[60, 70, 80, 90].map(value => <option key={value} value={value}>{value}%</option>)}
          </select>
        </div>
        <button type="button" className="erp-reload" disabled={loading} onClick={reload}>↻ Làm mới</button>
      </div>
      <p className="erp-note">Số liệu lấy từ các lượt thi đã nộp thuộc tài khoản hiện tại. Mục tiêu điểm được lưu trên trình duyệt, không thay đổi điểm thi thật.</p>

      {loading && <div className="erp-state" role="status">Đang tải kết quả luyện thi…</div>}
      {!loading && error && <div className="erp-state erp-state-error" role="alert">{error}<button type="button" onClick={reload}>Thử lại</button></div>}

      {!loading && data && summary && <>
        <section className="erp-stats" aria-label="Tổng quan kết quả">
          <article className="erp-stat"><span className="erp-stat-icon">▤</span><p>Bài đã nộp</p><strong>{summary.completedAttempts}</strong><small>Không tính lượt chưa nộp</small></article>
          <article className="erp-stat"><span className="erp-stat-icon">◈</span><p>Điểm trung bình</p><strong>{percent(summary.averageScorePercent)}</strong><small>Trên các bài đã nộp</small></article>
          <article className="erp-stat"><span className="erp-stat-icon">★</span><p>Điểm cao nhất</p><strong>{percent(summary.bestScorePercent)}</strong><small>Kết quả tốt nhất</small></article>
          <article className="erp-stat"><span className="erp-stat-icon">✓</span><p>Tỷ lệ trả lời đúng</p><strong>{percent(summary.weightedAccuracyPercent)}</strong><small>{summary.correctAnswers}/{summary.totalQuestions} câu đúng</small></article>
        </section>

        {summary.completedAttempts === 0 ? (
          <section className="erp-empty" aria-label="Chưa có dữ liệu"><span>◉</span><h2>Chưa có kết quả luyện thi</h2><p>Hãy tạo đề trong Luyện thi AI, làm bài và nộp để kết quả xuất hiện tại đây.</p><Link to="/app/quizzes" className="erp-hero-primary">Bắt đầu luyện thi ↗</Link></section>
        ) : <>
          <div className="erp-insight">
            <div><span>ĐÁNH GIÁ GẦN ĐÂY</span><h2>{last ? `Bài gần nhất đạt ${percent(last.scorePercent)}` : "Tiếp tục nâng cao kiến thức"}</h2><p>{delta === null ? "Cần ít nhất 2 kết quả trong biểu đồ để so sánh xu hướng." : delta > 0 ? `Tăng ${percent(delta)} so với lần liền trước trong biểu đồ.` : delta < 0 ? `Giảm ${percent(Math.abs(delta))} so với lần liền trước. Hãy xem lại các câu sai.` : "Điểm không đổi so với lần liền trước."}</p></div>
            <span className={last && last.scorePercent >= goal ? "erp-insight-ok" : "erp-insight-review"}>{last ? (last.scorePercent >= goal ? "✓ Đạt mục tiêu" : "↗ Chưa đạt mục tiêu") : "Chưa đủ dữ liệu"}</span>
          </div>

          <div className="erp-columns">
            <section className="erp-panel">
              <div className="erp-section-head"><div><span>01 · BIỂU ĐỒ</span><h2>Xu hướng điểm số</h2></div><small>{data.scoreTrend.length} lượt gần đây</small></div>
              <TrendChart scores={data.scoreTrend} target={goal} />
              <p className="erp-caption">Đường đứt nét thể hiện mục tiêu {goal}%. Chọn một cột để mở kết quả và lời giải chi tiết. Biểu đồ sử dụng các lượt API trả về.</p>
            </section>
            <section className="erp-panel">
              <div className="erp-section-head"><div><span>02 · KIẾN THỨC</span><h2>Kết quả theo tài liệu</h2></div><small>{data.byDocument.length} tài liệu</small></div>
              {data.byDocument.length === 0 ? <p className="erp-muted">Chưa có thống kê theo tài liệu.</p> : <div className="erp-docs">
                {data.byDocument.map(doc => <div key={doc.documentId} className="erp-doc">
                  <div className="erp-doc-top"><strong title={doc.documentName}>{doc.documentName}</strong><b>{percent(doc.averageScorePercent)}</b></div>
                  <div className="erp-meter"><span style={{ width: `${clamp(doc.averageScorePercent)}%` }} /></div>
                  <small>{doc.completedAttempts} bài · Điểm cao nhất {percent(doc.bestScorePercent)}</small>
                </div>)}
              </div>}
            </section>
          </div>

          <div className="erp-columns">
            <section className="erp-panel">
              <div className="erp-section-head"><div><span>03 · ÔN TẬP</span><h2>Nội dung nên xem lại</h2></div><small>{reviews.length} vị trí nguồn</small></div>
              {reviews.length === 0 ? <p className="erp-muted">Không có nguồn ôn tập cần ưu tiên trong phạm vi các lượt được xét.</p> : <ol className="erp-reviews">
                {visibleReviews.map(item => {
                  const isWord = /\.(doc|docx)$/i.test(item.documentName);
                  return <li key={`${item.documentId}-${item.pageNumber}`}>
                    <div className="erp-review-title"><strong>{isWord ? "Phần" : "Trang"} {item.pageNumber} · {item.documentName}</strong><span>{item.incorrectCount} lần sai</span></div>
                    {item.sourceExcerpt && <p>{item.sourceExcerpt}</p>}
                    <a href={`${getDocumentFileUrl(item.documentId)}${isWord ? "" : `#page=${item.pageNumber}`}`} target="_blank" rel="noreferrer">↗ {isWord ? "Mở tài liệu gốc" : "Xem trang tài liệu"}</a>
                  </li>;
                })}
              </ol>}
              {reviews.length > 4 && <button type="button" className="erp-link-button" onClick={() => setShowAllReviews(v => !v)}>{showAllReviews ? "Thu gọn" : `Xem thêm ${reviews.length - 4} vị trí`} ↗</button>}
              <p className="erp-caption">{data.methodology.reviewMeaning} Phạm vi phân tích: {data.methodology.reviewAttemptsConsidered} lượt.</p>
            </section>
            <section className="erp-panel">
              <div className="erp-section-head"><div><span>04 · LỊCH SỬ</span><h2>Những bài đã nộp</h2></div><small>{recent.length} lượt API trả về</small></div>
              <div className="erp-attempt-controls">
                <label className="erp-search"><span className="erp-sr-only">Tìm bộ đề</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm đề hoặc tài liệu..." /></label>
                <select aria-label="Sắp xếp lịch sử" value={sort} onChange={event => setSort(event.target.value as SortMode)}>
                  <option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="highest">Điểm cao nhất</option>
                </select>
              </div>
              <div className="erp-filters" role="group" aria-label="Lọc kết quả luyện thi">
                <button type="button" aria-pressed={filter === "all"} className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Tất cả</button>
                <button type="button" aria-pressed={filter === "goal"} className={filter === "goal" ? "active" : ""} onClick={() => setFilter("goal")}>Đạt mục tiêu</button>
                <button type="button" aria-pressed={filter === "review"} className={filter === "review" ? "active" : ""} onClick={() => setFilter("review")}>Cần ôn lại</button>
              </div>
              {visibleAttempts.length === 0 ? <p className="erp-muted">Không có bài nộp phù hợp bộ lọc.</p> : <div className="erp-attempt-list">
                {visibleAttempts.map(item => <Link key={item.attemptId} to={`/app/results/${item.attemptId}`} className="erp-attempt">
                  <span className="erp-attempt-icon" aria-hidden="true">▤</span>
                  <span className="erp-attempt-info"><strong>{item.quizTitle}</strong><small>{item.documentName} · {displayTime(item.submittedAtUtc)}</small></span>
                  <b className={item.scorePercent >= goal ? "erp-score-good" : "erp-score-low"}>{percent(item.scorePercent)}</b>
                  <span aria-hidden="true">↗</span>
                </Link>)}
              </div>}
              <Link className="erp-more" to="/app/quizzes">Tiếp tục luyện thi ↗</Link>
            </section>
          </div>
        </>}
      </>}
    </div>
  );
}
