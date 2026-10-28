import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAiStudyAdvice, getStudyPlan, updateStudyTask,
  type DailyMinutes, type PlanType, type StudyPlan,
} from "../services/studyPlanService";
import "./StudyPlanPage.css";
import "./StudyPlanFocus.css";

const pathOptions: { id: PlanType; name: string; description: string; icon: string }[] = [
  { id: "balanced", name: "Học cân bằng", description: "Kết hợp hỏi Gia sư AI và luyện thi để kiểm tra khả năng hiểu.", icon: "◇" },
  { id: "understanding", name: "Đọc hiểu tài liệu", description: "Đi từ lý thuyết, khái niệm và ví dụ đến câu hỏi vận dụng.", icon: "▤" },
  { id: "exam", name: "Ôn thi tăng tốc", description: "Làm bài thường xuyên, xem câu sai và ôn lại kiến thức còn yếu.", icon: "◉" },
];
const formatDate = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("vi-VN", {
    weekday: "long", day: "2-digit", month: "2-digit",
  }).format(date);
};

export default function StudyPlanPage() {
  const [planType, setPlanType] = useState<PlanType>("balanced");
  const [minutes, setMinutes] = useState<DailyMinutes>(45);
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState("");
  const [taskError, setTaskError] = useState("");
  const [advice, setAdvice] = useState("");
  const [adviceError, setAdviceError] = useState("");
  const [adviceBusy, setAdviceBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getStudyPlan(minutes, planType)
      .then(value => { if (active) { setPlan(value); setError(""); } })
      .catch((reason: unknown) => {
        if (active) { setError(reason instanceof Error ? reason.message : "Không tải được lộ trình."); setPlan(null); }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [minutes, planType, revision]);

  function selectPath(value: PlanType) {
    setLoading(true); setPlanType(value); setAdvice(""); setAdviceError(""); setTaskError("");
  }
  function selectMinutes(value: string) {
    const next = Number(value);
    if (next !== 30 && next !== 45 && next !== 60 && next !== 90) return;
    setLoading(true); setMinutes(next); setAdvice("");
  }
  function refresh() { setLoading(true); setRevision(x => x + 1); setTaskError(""); }

  async function toggleTask(date: string, docId: number, kind: string, completed: boolean) {
    if (saving) return;
    setSaving(`${date}-${docId}-${kind}`); setTaskError("");
    try {
      await updateStudyTask(date, docId, kind, completed, minutes, planType);
      setPlan(current => current ? ({ ...current,
        schedule: current.schedule.map(day => day.date === date && day.documentId === docId
          ? { ...day, tasks: day.tasks.map(task => task.kind === kind
            ? { ...task, completed, completedAtUtc: completed ? new Date().toISOString() : null }
            : task) }
          : day),
      }) : current);
    } catch (reason: unknown) {
      setTaskError(reason instanceof Error ? reason.message : "Không thể lưu nhiệm vụ.");
    } finally { setSaving(""); }
  }

  async function askAdvice() {
    setAdviceBusy(true); setAdviceError("");
    try { setAdvice(await getAiStudyAdvice(planType)); }
    catch (reason: unknown) { setAdviceError(reason instanceof Error ? reason.message : "Gia sư AI chưa phản hồi."); }
    finally { setAdviceBusy(false); }
  }

  return <div className="sp28-page study-focus">
    <section className="sp28-hero">
      <span className="sp28-overline">EDUMIND AI · KẾ HOẠCH HỌC TẬP</span>
      <h1>Chọn một lộ trình, học đúng việc cần học</h1>
      <p>Kế hoạch dựa trên tài liệu Word/PDF, kết quả luyện thi và những câu làm sai của chính bạn.</p>
      <div className="sp28-hero-controls">
        <label htmlFor="study-minutes">Thời gian mỗi ngày</label>
        <select id="study-minutes" value={minutes} onChange={event => selectMinutes(event.target.value)}>
          <option value={30}>30 phút</option><option value={45}>45 phút</option>
          <option value={60}>60 phút</option><option value={90}>90 phút</option>
        </select>
        <button type="button" onClick={refresh} disabled={loading}>↻ Cập nhật dữ liệu</button>
      </div>
    </section>

    <section className="sp28-panel" aria-label="Danh sách lộ trình học">
      <div className="sp28-heading"><div><span className="sp28-tag">03 LỘ TRÌNH</span><h2>Bạn muốn học theo cách nào?</h2></div></div>
      <div className="study-focus-options">
        {pathOptions.map(item => <button type="button" key={item.id}
          className={`study-focus-option ${planType === item.id ? "study-focus-active" : ""}`}
          aria-pressed={planType === item.id} onClick={() => selectPath(item.id)}>
          <span aria-hidden="true" className="study-focus-option-icon">{item.icon}</span>
          <strong>{item.name}</strong><small>{item.description}</small>
        </button>)}
      </div>
    </section>

    {loading && <div className="sp28-state" role="status">Đang tạo danh sách nhiệm vụ từ dữ liệu học tập…</div>}
    {!loading && error && <div className="sp28-error" role="alert">{error} <button onClick={refresh} type="button">Thử lại</button></div>}
    {!loading && plan && plan.priorities.length === 0 && <section className="sp28-panel sp28-empty">
      <h2>Bắt đầu bằng một tài liệu PDF hoặc Word</h2>
      <p>Tải tài liệu lên và lập chỉ mục, sau đó hỏi Gia sư AI và làm một đề để hệ thống nhận biết kiến thức cần ôn.</p>
      <Link to="/app/documents">Mở kho tài liệu →</Link>
    </section>}

    {!loading && plan && plan.priorities.length > 0 && <>
      <div className="sp28-summary">
        <div><strong>{plan.days} ngày</strong><span>Độ dài kế hoạch</span></div>
        <div><strong>{plan.dailyMinutes} phút</strong><span>Thời lượng mỗi ngày</span></div>
        <div><strong>{plan.priorities.length} tài liệu</strong><span>Đang được ưu tiên</span></div>
      </div>
      <section className="sp28-panel">
        <div className="sp28-heading"><div><span className="sp28-tag">DỮ LIỆU THẬT</span><h2>Những tài liệu nên học trước</h2></div></div>
        <div className="sp28-priorities">{plan.priorities.map((item, index) => <article className="sp28-priority" key={item.documentId}>
          <div className="sp28-rank">{index + 1}</div>
          <div className="sp28-priority-main"><h3 title={item.documentName}>{item.documentName}</h3><p>{item.reason}</p>
            <div className="sp28-chips"><span>{item.submittedQuizzes} bài thi đã nộp</span>
              <span>{item.latestScorePercent === null ? "Chưa có điểm" : `Điểm gần nhất ${item.latestScorePercent}%`}</span>
              <span>{item.wrongAnswersLast30Days} câu sai gần đây</span>
            </div>
          </div><span className="sp28-priority-score">Ưu tiên {item.priorityScore}</span>
        </article>)}</div>
      </section>
      <section className="sp28-panel">
        <div className="sp28-heading"><div><span className="sp28-tag">KẾ HOẠCH 7 NGÀY</span><h2>Danh sách việc cần học</h2></div></div>
        <p className="study-focus-tip">Chỉ có thể đánh dấu nhiệm vụ của hôm nay. Dấu hoàn thành được lưu vào MySQL và không tự đồng nghĩa với kiến thức đã nắm vững.</p>
        {taskError && <p role="alert" className="sp28-error">{taskError}</p>}
        <div className="sp28-days">{plan.schedule.map((day, index) => <article key={day.date} className={`sp28-day ${index === 0 ? "sp28-today" : ""}`}>
          <div className="sp28-day-top"><span>{index === 0 ? "HÔM NAY" : `NGÀY ${index + 1}`}</span><strong>{formatDate(day.date)}</strong></div>
          <h3>{day.documentName}</h3>
          <div className="sp28-tasks">{day.tasks.map(task => <div key={task.kind} className={`sp28-task ${task.completed ? "study-focus-complete" : ""}`}>
            <label className="study-focus-task-mark"><input type="checkbox" checked={task.completed}
              disabled={index !== 0 || Boolean(saving)}
              aria-label={`Hoàn thành nhiệm vụ ${task.title}`}
              onChange={event => void toggleTask(day.date, day.documentId, task.kind, event.target.checked)} /></label>
            <div className="sp28-task-content"><strong>{task.title}</strong><p>{task.detail}</p><small>Khoảng {task.estimatedMinutes} phút</small></div>
            <Link to={task.path}>Bắt đầu →</Link>
          </div>)}</div>
        </article>)}</div>
      </section>
      <section className="sp28-panel sp28-ai">
        <div><span className="sp28-tag">HƯỚNG DẪN BỔ SUNG</span><h2>Gợi ý cách học từ AI</h2>
          <p>AI đưa ra lời khuyên dựa trên điểm thi và tài liệu. Lộ trình vẫn hoạt động bình thường khi Ollama tắt.</p>
        </div>
        <button type="button" onClick={() => void askAdvice()} disabled={adviceBusy}>{adviceBusy ? "Đang phân tích…" : "Nhận lời khuyên AI"}</button>
        {adviceError && <p role="alert" className="sp28-advice-error">{adviceError}</p>}
        {advice && <div className="sp28-advice" aria-live="polite">{advice}</div>}
      </section>
      <p className="sp28-footnote">{plan.note} Khi có bài thi mới, chọn “Cập nhật dữ liệu” để tính lại kế hoạch.</p>
    </>}
  </div>;
}
