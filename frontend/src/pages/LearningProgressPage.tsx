import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getDocuments, getDocumentFileUrl, type DocumentItem } from "../services/documentService";
import {
  getLearningProgress,
  type LearningProgress,
  type ScoreEntry,
} from "../services/learningProgressService";
import "./LearningProgressPage.css";

const percent = (value: number) => `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value)}%`;
const dateTime = (value: string) => new Date(value).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });

function TrendChart({ scores }: { scores: ScoreEntry[] }) {
  if (!scores.length) {
    return <div className="progress-empty">Chưa có bài nộp để vẽ biểu đồ. <Link to="/app/quizzes">Bắt đầu luyện thi →</Link></div>;
  }
  return (
    <div className="progress-chart-scroll">
      <div className="progress-chart" role="img" aria-label={`Biểu đồ điểm của ${scores.length} bài đã nộp gần nhất, theo thứ tự thời gian`}>
        <div className="progress-chart-grid" aria-hidden="true"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
        <div className="progress-chart-bars">
          {scores.map((entry, index) => (
            <Link key={entry.attemptId} to={`/app/results/${entry.attemptId}`}
              className="progress-bar-item"
              title={`${entry.quizTitle}: ${percent(entry.scorePercent)} – ${dateTime(entry.submittedAtUtc)}`}
              aria-label={`Bài ${index + 1}: ${entry.quizTitle}, đạt ${percent(entry.scorePercent)}. Xem kết quả.`}>
              <span className="progress-bar-value">{Math.round(entry.scorePercent)}</span>
              <span className="progress-bar-track"><span style={{ height: `${Math.max(0, Math.min(100, entry.scorePercent))}%` }} /></span>
              <span className="progress-bar-label">#{entry.attemptId}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LearningProgressPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDoc = Number(searchParams.get("documentId"));
  const selectedDocumentId = Number.isSafeInteger(initialDoc) && initialDoc > 0 ? initialDoc : null;
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [data, setData] = useState<LearningProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);

  const load = useCallback(() => setReloadCount((count) => count + 1), []);

  useEffect(() => {
    let active = true;
    getDocuments().then((docs) => { if (active) setDocuments(docs); }).catch(() => {
      // Biểu đồ vẫn dùng được nếu API kho tài liệu tạm lỗi.
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    getLearningProgress(selectedDocumentId ?? undefined)
      .then((result) => { if (active) { setData(result); setError(""); } })
      .catch((reason: unknown) => { if (active) { setData(null); setError(reason instanceof Error ? reason.message : "Không tải được tiến độ."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedDocumentId, reloadCount]);

  function chooseDocument(value: string) {
    setLoading(true);
    setData(null);
    if (value) setSearchParams({ documentId: value });
    else setSearchParams({});
  }

  const summary = data?.summary;
  return (
    <section className="learning-progress-page">
      <div className="progress-head">
        <div>
          <span className="progress-eyebrow">EDUMIND AI / BƯỚC 16</span>
          <h1>Tiến độ học tập</h1>
          <p>Theo dõi kết quả đã nộp và tìm các trang PDF cần ôn lại. Dữ liệu lấy trực tiếp từ MySQL.</p>
        </div>
        <div className="progress-actions">
          <label htmlFor="progress-document">Lọc theo tài liệu</label>
          <select id="progress-document" value={selectedDocumentId ?? ""} onChange={(e) => chooseDocument(e.target.value)}>
            <option value="">Tất cả tài liệu</option>
            {selectedDocumentId && !documents.some((doc) => doc.id === selectedDocumentId) &&
              <option value={selectedDocumentId}>Tài liệu #{selectedDocumentId}</option>}
            {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.originalFileName}</option>)}
          </select>
          <button type="button" className="progress-refresh" onClick={() => { setLoading(true); load(); }} disabled={loading}>↻ Làm mới</button>
        </div>
      </div>

      <p className="progress-demo-note">Bản Development: tiến độ đang được tổng hợp chung trên máy, chưa phân tách theo tài khoản học viên.</p>
      {loading && <div role="status" className="progress-state">Đang tải thống kê từ Backend…</div>}
      {error && <div className="progress-error" role="alert">{error} <button type="button" onClick={() => { setLoading(true); load(); }}>Thử lại</button></div>}

      {data && summary && (
        <>
          <div className="progress-metrics">
            <article className="progress-metric"><span>✓</span><p>Bài đã nộp</p><strong>{summary.completedAttempts}</strong><small>Không tính lượt chưa nộp</small></article>
            <article className="progress-metric"><span>◈</span><p>Điểm trung bình</p><strong>{percent(summary.averageScorePercent)}</strong><small>Trung bình điểm của các bài</small></article>
            <article className="progress-metric"><span>★</span><p>Điểm cao nhất</p><strong>{percent(summary.bestScorePercent)}</strong><small>Trong các bài đã nộp</small></article>
            <article className="progress-metric"><span>◎</span><p>Tỷ lệ đúng theo câu</p><strong>{percent(summary.weightedAccuracyPercent)}</strong><small>{summary.correctAnswers}/{summary.totalQuestions} câu trả lời đúng</small></article>
          </div>
          {summary.completedAttempts === 0 ? (
            <div className="progress-empty progress-first">
              <div className="progress-empty-icon">📘</div>
              <h2>Chưa có kết quả học tập</h2>
              <p>Hãy vào Luyện thi AI, mở một đề đã lưu, làm bài và nộp để hệ thống bắt đầu thống kê.</p>
              <Link className="progress-cta" to="/app/quizzes">Đi tới Luyện thi AI →</Link>
            </div>
          ) : (
            <>
              <div className="progress-columns">
                <section className="progress-panel">
                  <div className="progress-section-head"><div><span>01 / ĐIỂM SỐ</span><h2>Biểu đồ kết quả gần đây</h2></div><small>{data.scoreTrend.length} lượt mới nhất</small></div>
                  <TrendChart scores={data.scoreTrend} />
                  <p className="progress-caption">Mỗi cột là một bài đã nộp, sắp theo thời gian. Chọn cột để xem bài và lời giải chi tiết.</p>
                </section>
                <section className="progress-panel">
                  <div className="progress-section-head"><div><span>02 / THEO TÀI LIỆU</span><h2>Thống kê PDF</h2></div><small>{data.byDocument.length} tài liệu</small></div>
                  <div className="progress-doc-list">
                    {data.byDocument.map((doc) => (
                      <div key={doc.documentId} className="progress-doc">
                        <div className="progress-doc-title"><strong title={doc.documentName}>{doc.documentName}</strong><span>{percent(doc.averageScorePercent)}</span></div>
                        <div className="progress-meter"><span style={{ width: `${Math.max(0, Math.min(100, doc.averageScorePercent))}%` }} /></div>
                        <small>{doc.completedAttempts} bài nộp · Điểm cao nhất {percent(doc.bestScorePercent)}</small>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="progress-columns progress-bottom-columns">
                <section className="progress-panel">
                  <div className="progress-section-head"><div><span>03 / ÔN TẬP</span><h2>Trang PDF nên xem lại</h2></div><small>Từ câu sai / bỏ trống</small></div>
                  {data.reviewPages.length === 0 ? (
                    <p className="progress-muted">Chưa ghi nhận câu sai hoặc chưa có thông tin trang nguồn trong các lượt được xét.</p>
                  ) : (
                    <ol className="progress-review-list">
                      {data.reviewPages.map((review) => (
                        <li key={`${review.documentId}:${review.pageNumber}`}>
                          <div className="progress-review-top"><strong>Trang {review.pageNumber} · {review.documentName}</strong><span>{review.incorrectCount} lần sai</span></div>
                          {review.sourceExcerpt && <p>{review.sourceExcerpt}</p>}
                          <a target="_blank" rel="noreferrer" href={`${getDocumentFileUrl(review.documentId)}#page=${review.pageNumber}`}>↗ Mở PDF tại trang {review.pageNumber}</a>
                        </li>
                      ))}
                    </ol>
                  )}
                  <p className="progress-caption">{data.methodology.reviewMeaning} Phạm vi đã xét: {data.methodology.reviewAttemptsConsidered} lượt.</p>
                </section>
                <section className="progress-panel">
                  <div className="progress-section-head"><div><span>04 / LỊCH SỬ</span><h2>Bài nộp gần nhất</h2></div><small>{data.recentAttempts.length} lượt</small></div>
                  <div className="progress-history-list">
                    {data.recentAttempts.map((attempt) => (
                      <Link key={attempt.attemptId} to={`/app/results/${attempt.attemptId}`} className="progress-history-item">
                        <span><strong>{attempt.quizTitle}</strong><small>{attempt.documentName} · {dateTime(attempt.submittedAtUtc)}</small></span>
                        <b>{percent(attempt.scorePercent)}</b>
                      </Link>
                    ))}
                  </div>
                  <Link className="progress-more" to="/app/quizzes">Tiếp tục luyện thi →</Link>
                </section>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
