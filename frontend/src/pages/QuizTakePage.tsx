import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getQuizAttempt, submitQuizAttempt,
  type AnswerOption, type QuizAttemptDetail,
} from "../services/quizService";
import "./QuizAttemptPage.css";

const options: AnswerOption[] = ["A", "B", "C", "D"];
const draftKey = (id: number) => `edumind:quiz-attempt-draft:${id}`;

export default function QuizTakePage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const id = Number(attemptId);
  const validId = Number.isSafeInteger(id) && id > 0;
  const [attempt, setAttempt] = useState<QuizAttemptDetail | null>(null);
  const [choices, setChoices] = useState<Record<number, AnswerOption>>({});
  const [flagged, setFlagged] = useState<number[]>([]);
  const [localDraftOk, setLocalDraftOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!validId) return;
    let active = true;
    getQuizAttempt(id).then((data) => {
      if (!active) return;
      setAttempt(data);
      if (!data.submittedAtUtc) {
        try {
          const raw = window.localStorage.getItem(draftKey(data.id));
          if (raw) {
            const draft: unknown = JSON.parse(raw);
            if (draft && typeof draft === "object") {
              const obj = draft as { choices?: Record<string, string>; flagged?: number[] };
              const restored: Record<number, AnswerOption> = {};
              for (const question of data.questions) {
                const option = obj.choices?.[String(question.id)];
                if (options.includes(option as AnswerOption)) restored[question.id] = option as AnswerOption;
              }
              setChoices(restored);
              setFlagged(Array.isArray(obj.flagged) ? obj.flagged.filter((n) => data.questions.some((q) => q.id === n)) : []);
            }
          }
        } catch { setLocalDraftOk(false); }
      }
    }).catch((e: unknown) => {
      if (active) setError(e instanceof Error ? e.message : "Không tải được bài thi.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, validId]);

  function saveLocalDraft(nextChoices: Record<number, AnswerOption>, nextFlagged: number[]) {
    if (!attempt) return;
    try {
      window.localStorage.setItem(draftKey(attempt.id), JSON.stringify({ choices: nextChoices, flagged: nextFlagged }));
      setLocalDraftOk(true);
    } catch {
      setLocalDraftOk(false);
    }
  }

  function updateChoice(questionId: number, value: AnswerOption) {
    const updated = { ...choices, [questionId]: value };
    setChoices(updated);
    saveLocalDraft(updated, flagged);
  }

  const filled = attempt?.questions.filter((q) => choices[q.id]).length ?? 0;
  const total = attempt?.questions.length ?? 0;
  const remaining = total - filled;
  const progress = total ? Math.round(filled / total * 100) : 0;

  function scrollToQuestion(questionId: number) {
    document.getElementById(`eqt-question-${questionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function toggleFlag(idToFlag: number) {
    const updated = flagged.includes(idToFlag) ? flagged.filter((n) => n !== idToFlag) : [...flagged, idToFlag];
    setFlagged(updated);
    saveLocalDraft(choices, updated);
  }

  async function submit() {
    if (!attempt || sending || attempt.submittedAtUtc) return;
    const confirmText = remaining
      ? `Bạn còn ${remaining} câu chưa trả lời. Nếu nộp bây giờ, các câu trống sẽ tính sai. Bạn vẫn muốn nộp?`
      : "Bạn muốn nộp bài? Sau khi nộp sẽ không thể chỉnh sửa đáp án.";
    if (!window.confirm(confirmText)) return;
    setError(""); setSending(true);
    try {
      await submitQuizAttempt(attempt.id, attempt.questions.map((question) => ({
        questionId: question.id,
        selectedOption: choices[question.id] ?? null,
      })));
      try { window.localStorage.removeItem(draftKey(attempt.id)); } catch { /* Trình duyệt có thể chặn storage */ }
      navigate(`/app/results/${attempt.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa nộp được bài. Bạn có thể thử lại.");
      setSending(false);
    }
  }

  return (
    <div className="quiz-flow quiz-take">
      <header className="quiz-flow-head">
        <div><span className="quiz-flow-eyebrow">EDUMIND AI · BÀI LUYỆN THI</span><h1>Làm bài trắc nghiệm</h1><p>{attempt?.quizTitle ?? "Đang chuẩn bị đề thi..."}</p></div>
        <Link className="quiz-flow-back" to="/app/quizzes">← Trở về Kho đề</Link>
      </header>
      {(!validId || error) && <div className="quiz-flow-alert quiz-flow-error" role="alert">{validId ? error : "ID lượt thi không hợp lệ."}</div>}
      {loading && validId && <div className="quiz-flow-box" role="status">Đang tải câu hỏi và lựa chọn trước đó...</div>}
      {attempt?.submittedAtUtc && <div className="quiz-flow-box">Lượt này đã được nộp. <Link to={`/app/results/${attempt.id}`}>Xem kết quả và lời giải ↗</Link></div>}
      {attempt && !attempt.submittedAtUtc && <>
        <div className="quiz-take-layout">
          <main className="quiz-take-content">
            <div className="quiz-flow-box quiz-flow-toolbar">
              <div className="quiz-flow-progress-top"><strong>Tiến độ làm bài</strong><span>{filled}/{total} câu · {progress}%</span></div>
              <div className="quiz-flow-meter" role="progressbar" aria-label="Tiến độ trả lời" aria-valuenow={filled} aria-valuemin={0} aria-valuemax={total}><div style={{ width: `${progress}%` }} /></div>
              <div className="quiz-flow-progress-bottom"><span>{remaining} câu chưa trả lời</span><span>{localDraftOk ? "✓ Đáp án được lưu tạm trên trình duyệt này" : "! Không thể tự lưu tạm trên trình duyệt"}</span></div>
            </div>
            {attempt.questions.map((question) => <fieldset id={`eqt-question-${question.id}`} className="quiz-flow-box quiz-flow-question" key={question.id} disabled={sending}>
              <legend><span className="quiz-flow-question-number">Câu {question.position}/{total}</span>{question.content}</legend>
              <div className="quiz-flow-answers">{options.map((letter) => <label key={letter} className={`quiz-flow-choice ${choices[question.id] === letter ? "quiz-flow-selected" : ""}`}>
                <input type="radio" name={`question-${question.id}`} value={letter} checked={choices[question.id] === letter} onChange={() => updateChoice(question.id, letter)} />
                <span className="quiz-flow-letter">{letter}</span><span>{question[`option${letter}` as keyof typeof question]}</span>
              </label>)}</div>
              <div className="quiz-flow-question-tools"><button type="button" onClick={() => toggleFlag(question.id)} aria-pressed={flagged.includes(question.id)} disabled={sending} className={flagged.includes(question.id) ? "is-flagged" : ""}>{flagged.includes(question.id) ? "⚑ Đã đánh dấu ôn lại" : "⚑ Đánh dấu xem lại"}</button><span>{choices[question.id] ? `Đã chọn đáp án ${choices[question.id]}` : "Chưa chọn đáp án"}</span></div>
            </fieldset>)}
            <div className="quiz-flow-submitbar"><span>Chỉ gửi đáp án lên hệ thống khi bạn nhấn nộp bài. Bạn có thể xem lại các câu đã đánh dấu trước khi nộp.</span><button className="quiz-flow-primary" type="button" disabled={sending || total === 0} onClick={() => void submit()}>{sending ? "Đang nộp & chấm điểm..." : `Nộp bài · ${filled}/${total} câu`}</button></div>
          </main>
          <aside className="quiz-take-sidebar" aria-label="Điều hướng câu hỏi">
            <div className="quiz-flow-box quiz-take-navigator"><span className="quiz-flow-eyebrow">ĐIỀU HƯỚNG</span><h2>Danh sách câu hỏi</h2>
              <div className="quiz-take-legend"><span><i className="is-answered" />Đã trả lời</span><span><i />Chưa làm</span><span><i className="is-flagged" />Đánh dấu</span></div>
              <div className="quiz-take-map">{attempt.questions.map((question) => <button type="button" key={question.id} className={`${choices[question.id] ? "is-answered" : ""} ${flagged.includes(question.id) ? "is-flagged" : ""}`} aria-label={`Đến câu ${question.position}${choices[question.id] ? ", đã trả lời" : ", chưa trả lời"}${flagged.includes(question.id) ? ", đánh dấu xem lại" : ""}`} onClick={() => scrollToQuestion(question.id)}>{question.position}</button>)}</div>
              <div className="quiz-take-sidebar-foot"><strong>{flagged.length} câu đánh dấu</strong><small>Nhấn vào số câu để chuyển nhanh tới câu đó.</small></div>
            </div>
          </aside>
        </div>
      </>}
    </div>
  );
}
