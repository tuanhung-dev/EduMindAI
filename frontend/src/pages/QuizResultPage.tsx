import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getDocumentFileUrl } from "../services/documentService";
import { getQuizAttempt, type QuizAttemptDetail, type AnswerOption } from "../services/quizService";
import "./QuizAttemptPage.css";

type ReviewFilter = "all" | "wrong" | "correct";

function optionLabel(letter: AnswerOption | null, question: QuizAttemptDetail["questions"][number]) {
  if (letter === "A") return question.optionA;
  if (letter === "B") return question.optionB;
  if (letter === "C") return question.optionC;
  if (letter === "D") return question.optionD;
  return "Chưa trả lời";
}

export default function QuizResultPage() {
  const { attemptId } = useParams();
  const id = Number(attemptId);
  const validId = Number.isSafeInteger(id) && id > 0;
  const [attempt, setAttempt] = useState<QuizAttemptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<ReviewFilter>("all");

  useEffect(() => {
    if (!validId) return;
    let active = true;
    getQuizAttempt(id)
      .then((data) => { if (active) setAttempt(data); })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Không tải được kết quả."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, validId]);

  const correct = attempt?.questions.filter((question) => question.isCorrect).length ?? 0;
  const incorrect = (attempt?.questions.length ?? 0) - correct;
  const shownQuestions = useMemo(() => (attempt?.questions ?? []).filter((question) =>
    filter === "all" || (filter === "correct" ? question.isCorrect : !question.isCorrect)
  ), [attempt, filter]);
  const score = attempt?.scorePercent ?? 0;
  const scoreLabel = score >= 80 ? "Nắm khá vững kiến thức" : score >= 50 ? "Đang tiến bộ, tiếp tục ôn tập" : "Hãy ôn lại các câu chưa đúng";

  return <div className="quiz-flow quiz-result">
    <header className="quiz-flow-head"><div><span className="quiz-flow-eyebrow">EDUMIND AI · KẾT QUẢ LUYỆN THI</span><h1>Kết quả & lời giải</h1><p>{attempt?.quizTitle ?? "Đang tải kết quả bài làm..."}</p></div><Link className="quiz-flow-back" to="/app/quizzes">← Kho đề luyện thi</Link></header>
    {loading && validId && <div className="quiz-flow-box" role="status">Đang tải kết quả và lời giải...</div>}
    {(!validId || error) && <div className="quiz-flow-alert quiz-flow-error" role="alert">{validId ? error : "ID lượt thi không hợp lệ."}</div>}
    {attempt && !attempt.submittedAtUtc && <div className="quiz-flow-box">Lượt này chưa được nộp. <Link to={`/app/attempts/${attempt.id}/take`}>Tiếp tục làm bài ↗</Link></div>}
    {attempt?.submittedAtUtc && <>
      <section className="quiz-result-hero" aria-labelledby="quiz-result-title"><div className="quiz-result-score"><span>ĐIỂM BÀI LÀM</span><strong>{score.toFixed(1)}%</strong><div className="quiz-result-meter"><div style={{ width: `${Math.max(0, Math.min(100, score))}%` }} /></div><p id="quiz-result-title">{scoreLabel}</p></div>
        <div className="quiz-result-summary"><div><span>✓ Câu trả lời đúng</span><strong>{attempt.correctCount ?? correct}/{attempt.totalQuestions}</strong></div><div><span>✕ Cần ôn lại</span><strong>{incorrect}</strong></div><div><span>◷ Ngày nộp</span><strong className="quiz-result-date">{new Date(attempt.submittedAtUtc).toLocaleString("vi-VN")}</strong></div></div>
      </section>
      <section className="quiz-result-review" aria-labelledby="quiz-review-title"><div className="quiz-result-heading"><div><span className="quiz-flow-eyebrow">CHI TIẾT BÀI LÀM</span><h2 id="quiz-review-title">Xem lại và củng cố kiến thức</h2><p>Kiểm tra đáp án, lời giải và đối chiếu tài liệu nguồn để học hiệu quả hơn.</p></div><Link className="quiz-flow-back" to="/app/quizzes">Tạo đề khác ↗</Link></div>
        <div className="quiz-result-filters" role="group" aria-label="Lọc câu hỏi theo kết quả">
          <button type="button" className={filter === "all" ? "active" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Tất cả ({attempt.questions.length})</button>
          <button type="button" className={filter === "wrong" ? "active" : ""} aria-pressed={filter === "wrong"} onClick={() => setFilter("wrong")}>Cần ôn lại ({incorrect})</button>
          <button type="button" className={filter === "correct" ? "active" : ""} aria-pressed={filter === "correct"} onClick={() => setFilter("correct")}>Đã đúng ({correct})</button>
        </div>
        {shownQuestions.length === 0 && <div className="quiz-flow-box">Không có câu hỏi thuộc bộ lọc này.</div>}
        {shownQuestions.map((question) => <article key={question.id} className={`quiz-flow-box quiz-flow-review ${question.isCorrect ? "quiz-flow-correct" : "quiz-flow-wrong"}`}>
          <div className="quiz-flow-review-head"><h3>Câu {question.position}. {question.content}</h3><span className={question.isCorrect ? "is-correct" : "is-wrong"}>{question.isCorrect ? "✓ Đúng" : "✕ Cần ôn lại"}</span></div>
          <div className="quiz-result-answer-grid"><div><small>BẠN ĐÃ CHỌN</small><p>{question.selectedOption ? `${question.selectedOption}. ${optionLabel(question.selectedOption, question)}` : "Chưa trả lời"}</p></div><div><small>ĐÁP ÁN ĐÚNG</small><p>{question.correctOption ? `${question.correctOption}. ${optionLabel(question.correctOption, question)}` : "Không có dữ liệu"}</p></div></div>
          <div className="quiz-flow-explanation"><strong>✦ Giải thích</strong><p>{question.explanation ?? "Chưa có lời giải."}</p></div>
          {question.sourceExcerpt && <div className="quiz-flow-source"><strong>▤ Nội dung trích từ tài liệu</strong><p>{question.sourceExcerpt}</p></div>}
          {question.sourcePageNumber && <a target="_blank" rel="noreferrer" className="quiz-flow-link" href={`${getDocumentFileUrl(attempt.documentId)}${(attempt.documentName ?? "").toLowerCase().endsWith(".pdf") ? `#page=${Math.max(1, question.sourcePageNumber)}` : ""}`}>↗ {(attempt.documentName ?? "").toLowerCase().endsWith(".pdf") ? `Mở trang ${question.sourcePageNumber} trong PDF` : "Mở tài liệu Word để đối chiếu"}</a>}
        </article>)}
      </section>
      <div className="quiz-flow-actions"><Link className="quiz-flow-primary" to="/app/quizzes">← Quay lại Luyện thi AI</Link><Link className="quiz-flow-secondary" to="/app/progress">Xem tiến độ học tập ↗</Link></div>
    </>}
  </div>;
}
