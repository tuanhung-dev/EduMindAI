import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getQuizAttempt, submitQuizAttempt,
  type AnswerOption, type QuizAttemptDetail,
} from "../services/quizService";
import "./QuizAttemptPage.css";

const options: AnswerOption[] = ["A", "B", "C", "D"];

export default function QuizTakePage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const id = Number(attemptId);
  const validId = Number.isSafeInteger(id) && id > 0;
  const [attempt, setAttempt] = useState<QuizAttemptDetail | null>(null);
  const [choices, setChoices] = useState<Record<number, AnswerOption>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!validId) return;
    let active = true;
    getQuizAttempt(id).then((data) => {
      if (active) setAttempt(data);
    }).catch((e: unknown) => {
      if (active) setError(e instanceof Error ? e.message : "Không tải được bài thi.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, validId]);

  const filled = attempt?.questions.filter((q) => choices[q.id]).length ?? 0;
  const total = attempt?.questions.length ?? 0;

  async function submit() {
    if (!attempt || sending || attempt.submittedAtUtc) return;
    const unanswered = total - filled;
    if (!window.confirm(unanswered
      ? `Bạn còn ${unanswered} câu chưa chọn. Nộp bài ngay? Câu trống sẽ tính sai.`
      : "Bạn chắc chắn muốn nộp bài? Không thể chỉnh sửa sau khi nộp.")) return;
    setError(""); setSending(true);
    try {
      await submitQuizAttempt(attempt.id, attempt.questions.map((q) => ({
        questionId: q.id, selectedOption: choices[q.id] ?? null,
      })));
      navigate(`/app/results/${attempt.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa nộp được bài.");
    } finally { setSending(false); }
  }

  return (
    <section className="quiz-flow">
      <div className="quiz-flow-head">
        <div><span className="quiz-flow-eyebrow">EDUMIND AI / BƯỚC 15</span>
          <h1>Làm bài trắc nghiệm</h1><p>{attempt?.quizTitle ?? "Tải lượt làm bài..."}</p></div>
        <Link className="quiz-flow-back" to="/app/quizzes">← Kho đề</Link>
      </div>
      {(!validId || error) && <p className="quiz-flow-alert quiz-flow-error" role="alert">{validId ? error : "ID lượt thi không hợp lệ."}</p>}
      {loading && validId && <div className="quiz-flow-box">Đang tải câu hỏi…</div>}
      {attempt && attempt.submittedAtUtc && (
        <div className="quiz-flow-box">Lượt này đã nộp. <Link to={`/app/results/${attempt.id}`}>Xem kết quả và lời giải</Link></div>
      )}
      {attempt && !attempt.submittedAtUtc && (
        <>
          <div className="quiz-flow-box quiz-flow-toolbar">
            <span><strong>{filled}/{total}</strong> câu đã chọn</span>
            <div className="quiz-flow-meter"><div style={{ width: `${total ? (filled / total) * 100 : 0}%` }} /></div>
            <span>Không giới hạn thời gian · Câu trống tính sai</span>
          </div>
          {attempt.questions.map((q) => (
            <fieldset key={q.id} className="quiz-flow-box quiz-flow-question" disabled={sending}>
              <legend>Câu {q.position}. {q.content}</legend>
              <div className="quiz-flow-answers">
                {options.map((option) => (
                  <label key={option} className={`quiz-flow-choice ${choices[q.id] === option ? "quiz-flow-selected" : ""}`}>
                    <input type="radio" name={`question-${q.id}`} value={option}
                      checked={choices[q.id] === option}
                      onChange={() => setChoices((prev) => ({ ...prev, [q.id]: option }))} />
                    <span className="quiz-flow-letter">{option}</span>
                    <span>{q[`option${option}` as keyof typeof q]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="quiz-flow-submitbar">
            <span>Lựa chọn chỉ được lưu lên MySQL khi bạn nộp bài. Tải lại trang trước khi nộp sẽ mất lựa chọn.</span>
            <button className="quiz-flow-primary" type="button" disabled={sending || total === 0} onClick={submit}>
              {sending ? "Đang chấm điểm…" : "Nộp bài và xem kết quả"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
