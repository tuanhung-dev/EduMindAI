import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getDocumentFileUrl } from "../services/documentService";
import { getQuizAttempt, type QuizAttemptDetail, type AnswerOption } from "../services/quizService";
import "./QuizAttemptPage.css";

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

  useEffect(() => {
    if (!validId) return;
    let active = true;
    getQuizAttempt(id).then((data) => {
      if (active) setAttempt(data);
    }).catch((e: unknown) => {
      if (active) setError(e instanceof Error ? e.message : "Không tải được kết quả.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, validId]);

  return (
    <section className="quiz-flow">
      <div className="quiz-flow-head">
        <div><span className="quiz-flow-eyebrow">EDUMIND AI / BƯỚC 15</span>
          <h1>Kết quả bài trắc nghiệm</h1><p>{attempt?.quizTitle ?? "Kết quả được lưu trong MySQL"}</p></div>
        <Link className="quiz-flow-back" to="/app/quizzes">← Kho đề</Link>
      </div>
      {loading && validId && <div className="quiz-flow-box">Đang tải kết quả…</div>}
      {(!validId || error) && <p role="alert" className="quiz-flow-alert quiz-flow-error">{validId ? error : "ID lượt thi không hợp lệ."}</p>}
      {attempt && !attempt.submittedAtUtc && (
        <div className="quiz-flow-box">Bạn chưa nộp lượt này. <Link to={`/app/attempts/${attempt.id}/take`}>Quay lại làm bài</Link>.</div>
      )}
      {attempt && attempt.submittedAtUtc && (
        <>
          <div className="quiz-flow-box quiz-flow-result-head">
            <div><span>ĐIỂM SỐ</span><strong>{attempt.scorePercent?.toFixed(2) ?? "0.00"}%</strong></div>
            <div><span>SỐ CÂU ĐÚNG</span><strong>{attempt.correctCount}/{attempt.totalQuestions}</strong></div>
            <div><span>THỜI GIAN NỘP</span><strong className="quiz-flow-time">{new Date(attempt.submittedAtUtc).toLocaleString("vi-VN")}</strong></div>
          </div>
          <p className="quiz-flow-subhead">Chi tiết đáp án và lời giải. Điểm được Backend chấm từ đáp án đã lưu, không gọi AI lúc nộp.</p>
          {attempt.questions.map((q) => (
            <article key={q.id} className={`quiz-flow-box quiz-flow-review ${q.isCorrect ? "quiz-flow-correct" : "quiz-flow-wrong"}`}>
              <div className="quiz-flow-review-head"><h3>Câu {q.position}. {q.content}</h3>
                <span>{q.isCorrect ? "✓ Đúng" : "✕ Sai / bỏ trống"}</span></div>
              <p><b>Bạn chọn:</b> {q.selectedOption ? `${q.selectedOption}. ${optionLabel(q.selectedOption, q)}` : "Chưa trả lời"}</p>
              <p><b>Đáp án đúng:</b> {q.correctOption ? `${q.correctOption}. ${optionLabel(q.correctOption, q)}` : "Không có dữ liệu"}</p>
              <div className="quiz-flow-explanation"><b>Giải thích:</b> {q.explanation ?? "Chưa có lời giải."}</div>
              {q.sourceExcerpt && <div className="quiz-flow-source"><b>Đoạn tài liệu liên quan:</b> {q.sourceExcerpt}</div>}
              {q.sourcePageNumber && <a target="_blank" rel="noreferrer" className="quiz-flow-link"
                href={`${getDocumentFileUrl(attempt.documentId)}#page=${Math.max(1, q.sourcePageNumber)}`}>
                ↗ Mở trang {q.sourcePageNumber} của tài liệu PDF
              </a>}
            </article>
          ))}
          <div className="quiz-flow-actions"><Link className="quiz-flow-primary" to="/app/quizzes">Quay về Kho đề · Làm bài khác</Link></div>
        </>
      )}
    </section>
  );
}
