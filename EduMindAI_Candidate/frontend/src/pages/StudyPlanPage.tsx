import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  getAiStudyAdvice,
  getStudyPlan,
  updateStudyTask,
  type DailyMinutes,
  type PlanType,
  type StudyDay,
  type StudyPlan,
} from "../services/studyPlanService";
import "./StudyPlanPage.css";

type TaskFilter = "all" | "pending" | "done";
type PriorityFilter = "all" | "review" | "index";
type FocusMinutes = 25 | 45;

const pathOptions: {
  id: PlanType;
  icon: string;
  title: string;
  subtitle: string;
  detail: string;
}[] = [
  {
    id: "balanced",
    icon: "◇",
    title: "Học cân bằng",
    subtitle: "Lý thuyết + thực hành",
    detail: "Kết hợp đọc tài liệu, hỏi Gia sư AI và luyện thi để tự đánh giá.",
  },
  {
    id: "understanding",
    icon: "▤",
    title: "Đọc hiểu sâu",
    subtitle: "Nắm chắc kiến thức",
    detail: "Tập trung vào khái niệm, ví dụ minh họa và khả năng giải thích lại.",
  },
  {
    id: "exam",
    icon: "◉",
    title: "Ôn thi tăng tốc",
    subtitle: "Luyện đề + chữa lỗi",
    detail: "Làm bài, xem các câu sai và củng cố những nội dung còn yếu.",
  },
];

function formatFullDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("vi-VN", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
      }).format(date);
}

function formatShortDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(date);
}

function getError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getDayProgress(day: StudyDay) {
  return {
    total: day.tasks.length,
    completed: day.tasks.filter((task) => task.completed).length,
  };
}

// Ghi chú chỉ nằm trên trình duyệt, phân tách theo tài khoản và ngày học.
function DailyNote({ storageKey }: { storageKey: string }) {
  const [note, setNote] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey) ?? "";
    } catch {
      return "";
    }
  });
  const [saved, setSaved] = useState(true);

  function handleChange(value: string) {
    setNote(value);
    try {
      window.localStorage.setItem(storageKey, value);
      setSaved(true);
    } catch {
      setSaved(false);
    }
  }

  return (
    <section className="elp-card elp-note" aria-labelledby="elp-note-title">
      <div className="elp-section-head">
        <div>
          <span className="elp-eyebrow">GHI CHÚ CÁ NHÂN</span>
          <h2 id="elp-note-title">Mục tiêu hôm nay</h2>
        </div>
        <span className="elp-small-tag">Lưu trên máy</span>
      </div>
      <label className="elp-sr-only" htmlFor="elp-daily-note">
        Viết mục tiêu học tập trong ngày
      </label>
      <textarea
        id="elp-daily-note"
        value={note}
        maxLength={600}
        onChange={(event) => handleChange(event.target.value)}
        placeholder="Ví dụ: Đọc xong chương 2, ghi lại 3 khái niệm quan trọng..."
        rows={5}
      />
      <div className="elp-note-foot">
        <span>{saved ? "✓ Đã lưu trên trình duyệt" : "Không lưu được trên trình duyệt"}</span>
        <span>{note.length}/600</span>
      </div>
      <p className="elp-helper">Ghi chú không đồng bộ lên MySQL hoặc thiết bị khác.</p>
    </section>
  );
}

// Đồng hồ không sử dụng API, không tự thay đổi trạng thái hoàn thành nhiệm vụ.
function FocusTimer() {
  const [duration, setDuration] = useState<FocusMinutes>(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const deadlineRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) setRunning(false);
    }, 250);
    return () => window.clearInterval(interval);
  }, [running]);

  function start() {
    if (remaining === 0) setRemaining(duration * 60);
    deadlineRef.current = Date.now() + (remaining === 0 ? duration * 60 : remaining) * 1000;
    setRunning(true);
  }

  function pause() {
    setRemaining(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
    setRunning(false);
  }

  function reset(nextDuration: FocusMinutes = duration) {
    setRunning(false);
    setDuration(nextDuration);
    setRemaining(nextDuration * 60);
  }

  const clock = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  const progress = (1 - remaining / (duration * 60)) * 100;

  return (
    <section className="elp-card elp-focus" aria-labelledby="elp-focus-title">
      <div className="elp-section-head">
        <div>
          <span className="elp-eyebrow">TIỆN ÍCH HỌC TẬP</span>
          <h2 id="elp-focus-title">Bộ đếm tập trung</h2>
        </div>
        <span className="elp-small-tag">Chỉ FE</span>
      </div>
      <div className="elp-focus-options" role="group" aria-label="Thời lượng tập trung">
        {([25, 45] as FocusMinutes[]).map((value) => (
          <button
            type="button"
            key={value}
            disabled={running}
            aria-pressed={duration === value}
            className={duration === value ? "is-active" : ""}
            onClick={() => reset(value)}
          >
            {value} phút
          </button>
        ))}
      </div>
      <div
        className="elp-focus-dial"
        role="timer"
        aria-label={`Thời gian còn lại ${clock}`}
        style={{ "--elp-timer-percent": `${progress}%` } as CSSProperties}
      >
        <div>
          <strong>{clock}</strong>
          <span>{running ? "Đang tập trung" : remaining === 0 ? "Đã hết giờ" : "Sẵn sàng"}</span>
        </div>
      </div>
      <div className="elp-focus-actions">
        <button type="button" className="elp-btn elp-btn-primary" onClick={running ? pause : start}>
          {running ? "Ⅱ Tạm dừng" : remaining === 0 ? "↻ Bắt đầu lại" : "▶ Bắt đầu"}
        </button>
        <button type="button" className="elp-btn elp-btn-outline" onClick={() => reset()}>
          Đặt lại
        </button>
      </div>
      <p className="elp-helper">Đồng hồ tính thời gian khi trang còn mở; không ghi nhận giờ học lên server.</p>
    </section>
  );
}

export default function StudyPlanPage() {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase() ?? "guest";
  // Remount per account to avoid applying a previous student's local preferences.
  return <StudyPlanContent key={email} accountEmail={email} />;
}

function StudyPlanContent({ accountEmail }: { accountEmail: string }) {
  const settingsKey = `edumind:study-settings:${encodeURIComponent(accountEmail)}`;
  const [planType, setPlanType] = useState<PlanType>(() => {
    try {
      const value = JSON.parse(window.localStorage.getItem(settingsKey) || "null") as
        { planType?: PlanType } | null;
      return value?.planType && ["balanced", "understanding", "exam"].includes(value.planType)
        ? value.planType : "balanced";
    } catch { return "balanced"; }
  });
  const [minutes, setMinutes] = useState<DailyMinutes>(() => {
    try {
      const value = JSON.parse(window.localStorage.getItem(settingsKey) || "null") as
        { minutes?: DailyMinutes } | null;
      return value?.minutes && [30, 45, 60, 90].includes(value.minutes)
        ? value.minutes : 45;
    } catch { return 45; }
  });
  // Preferences are stored only in this browser; history and completion come from the API.
  useEffect(() => {
    try { window.localStorage.setItem(settingsKey, JSON.stringify({ planType, minutes })); }
    catch { /* Non-critical local preference. */ }
  }, [settingsKey, planType, minutes]);
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState("");
  const [taskError, setTaskError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [showAllPriorities, setShowAllPriorities] = useState(false);
  const [advice, setAdvice] = useState("");
  const [adviceError, setAdviceError] = useState("");
  const [adviceBusy, setAdviceBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getStudyPlan(minutes, planType)
      .then((value) => {
        if (!active) return;
        setPlan(value);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(getError(reason, "Không tải được lộ trình học."));
        setPlan(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [minutes, planType, revision]);

  const today = plan?.schedule.find((day) => day.date === plan.startDate);
  const todayProgress = today ? getDayProgress(today) : { total: 0, completed: 0 };
  const percentToday = todayProgress.total ? Math.round((todayProgress.completed / todayProgress.total) * 100) : 0;
  const totalTasks = plan?.schedule.reduce((sum, day) => sum + day.tasks.length, 0) ?? 0;
  const selectedDay = plan?.schedule.find((day) => day.date === selectedDate) ?? today ?? plan?.schedule[0];
  const canCompleteSelected = Boolean(plan && selectedDay && selectedDay.date === plan.startDate);

  const visibleTasks = useMemo(() => {
    if (!selectedDay) return [];
    return selectedDay.tasks.filter((task) =>
      taskFilter === "all" || (taskFilter === "done" ? task.completed : !task.completed),
    );
  }, [selectedDay, taskFilter]);

  const visiblePriorities = useMemo(() => {
    if (!plan) return [];
    const all = plan.priorities.filter((item) =>
      priorityFilter === "all" ||
      (priorityFilter === "review" && item.wrongAnswersLast30Days > 0) ||
      (priorityFilter === "index" && !item.indexed),
    );
    return showAllPriorities ? all : all.slice(0, 4);
  }, [plan, priorityFilter, showAllPriorities]);

  function selectPath(value: PlanType) {
    if (value === planType) return;
    setLoading(true);
    setPlanType(value);
    setSelectedDate("");
    setTaskFilter("all");
    setAdvice("");
    setAdviceError("");
    setTaskError("");
  }

  function selectMinutes(value: string) {
    const next = Number(value);
    if (next !== 30 && next !== 45 && next !== 60 && next !== 90) return;
    if (next === minutes) return;
    setLoading(true);
    setMinutes(next);
    setSelectedDate("");
    setTaskFilter("all");
    setAdvice("");
    setTaskError("");
  }

  function refresh() {
    setLoading(true);
    setRevision((value) => value + 1);
    setTaskError("");
  }

  async function toggleTask(day: StudyDay, kind: string, completed: boolean) {
    if (!plan || saving || day.date !== plan.startDate) return;
    const key = `${day.date}-${day.documentId}-${kind}`;
    setSaving(key);
    setTaskError("");
    try {
      await updateStudyTask(day.date, day.documentId, kind, completed, minutes, planType);
      // Reflect the successful write immediately, even if the subsequent GET fails.
      setPlan((current) => current ? {
        ...current,
        schedule: current.schedule.map((entry) =>
          entry.date === day.date && entry.documentId === day.documentId
            ? {
                ...entry,
                tasks: entry.tasks.map((task) => task.kind === kind
                  ? { ...task, completed, completedAtUtc: completed ? new Date().toISOString() : null }
                  : task,
                ),
              }
            : entry,
        ),
      } : current);
      try {
        // Re-fetch the server plan so streak and 7-day history update immediately.
        // The backend pins today's document once a task has been completed.
        setPlan(await getStudyPlan(minutes, planType));
      } catch {
        setTaskError("Đã lưu trạng thái nhưng chưa đồng bộ lại số liệu. Chọn Làm mới để cập nhật.");
      }
    } catch (reason: unknown) {
      setTaskError(getError(reason, "Không thể lưu trạng thái nhiệm vụ."));
    } finally {
      setSaving("");
    }
  }

  async function askAdvice() {
    if (adviceBusy || loading) return;
    setAdviceBusy(true);
    setAdviceError("");
    try {
      setAdvice(await getAiStudyAdvice(planType));
    } catch (reason: unknown) {
      setAdviceError(getError(reason, "Gia sư AI chưa phản hồi."));
    } finally {
      setAdviceBusy(false);
    }
  }

  const noteKey = `edumind:study-note:${encodeURIComponent(accountEmail)}:${plan?.startDate ?? "today"}`;

  return (
    <div className="elp-page">
      <header className="elp-hero">
        <div className="elp-hero-copy">
          <span className="elp-eyebrow elp-eyebrow-light">EDUMIND AI · KẾ HOẠCH HỌC TẬP</span>
          <h1>Lộ trình rõ ràng.<br /><em>Tiến bộ mỗi ngày.</em></h1>
          <p>
            Biết hôm nay nên học gì, ưu tiên tài liệu nào và tiến gần hơn tới mục tiêu
            bằng lịch học xây dựng từ dữ liệu học tập của bạn.
          </p>
          <div className="elp-hero-actions">
            <a href="#elp-week" className="elp-btn elp-btn-light">Xem lịch học 7 ngày ↓</a>
            <Link to="/app/progress" className="elp-btn elp-btn-ghost">Xem kết quả học tập ↗</Link>
          </div>
          <div className="elp-hero-tags">
            <span>✓ Cá nhân hóa theo tài liệu</span>
            <span>✓ Có nhiệm vụ cụ thể</span>
            <span>✓ Theo dõi hoàn thành</span>
          </div>
        </div>
        <div className="elp-hero-illustration" aria-hidden="true">
          <div className="elp-illustration-card"><span>01</span><strong>Đọc tài liệu</strong><small>Nắm ý chính</small></div>
          <div className="elp-illustration-line" />
          <div className="elp-illustration-card elp-illustration-middle"><span>02</span><strong>Hỏi Gia sư AI</strong><small>Hiểu sâu kiến thức</small></div>
          <div className="elp-illustration-line" />
          <div className="elp-illustration-card"><span>03</span><strong>Luyện tập</strong><small>Đánh giá tiến bộ</small></div>
        </div>
      </header>

      <section className="elp-config" aria-labelledby="elp-config-title">
        <div className="elp-section-head">
          <div>
            <span className="elp-eyebrow">THIẾT LẬP LỘ TRÌNH</span>
            <h2 id="elp-config-title">Chọn cách học phù hợp với bạn</h2>
            <p>Bạn có thể chuyển phương pháp và thời lượng; hệ thống sẽ tính lại kế hoạch.</p>
          </div>
          <div className="elp-config-controls">
            <label htmlFor="elp-minutes">Thời gian mỗi ngày</label>
            <select id="elp-minutes" value={minutes} disabled={loading || Boolean(saving)} onChange={(event) => selectMinutes(event.target.value)}>
              <option value={30}>30 phút/ngày</option>
              <option value={45}>45 phút/ngày</option>
              <option value={60}>60 phút/ngày</option>
              <option value={90}>90 phút/ngày</option>
            </select>
            <button type="button" className="elp-btn elp-btn-outline" onClick={refresh} disabled={loading || Boolean(saving)}>
              ↻ Làm mới
            </button>
          </div>
        </div>
        <div className="elp-paths" role="group" aria-label="Chọn phương pháp học">
          {pathOptions.map((item) => (
            <button type="button" key={item.id} className={`elp-path ${planType === item.id ? "is-selected" : ""}`}
              aria-pressed={planType === item.id} disabled={loading || Boolean(saving)} onClick={() => selectPath(item.id)}>
              <span className="elp-path-icon" aria-hidden="true">{item.icon}</span>
              <span className="elp-path-title"><strong>{item.title}</strong><small>{item.subtitle}</small></span>
              <span className="elp-path-detail">{item.detail}</span>
              <span className="elp-path-check" aria-hidden="true">{planType === item.id ? "✓" : "○"}</span>
            </button>
          ))}
        </div>
      </section>

      {loading && <div className="elp-feedback" role="status"><span className="elp-spinner" aria-hidden="true" /><h2>Đang cập nhật lộ trình...</h2><p>Hệ thống đang tổng hợp tài liệu và kết quả luyện thi.</p></div>}
      {!loading && error && <div className="elp-feedback elp-feedback-error" role="alert"><span aria-hidden="true">!</span><h2>Chưa tải được lộ trình</h2><p>{error}</p><button type="button" className="elp-btn elp-btn-primary" onClick={refresh}>Thử lại</button></div>}
      {!loading && plan && plan.priorities.length === 0 && <section className="elp-feedback" aria-labelledby="elp-empty-title">
        <span aria-hidden="true">▤</span><h2 id="elp-empty-title">Bắt đầu từ tài liệu đầu tiên</h2>
        <p>Hãy tải Word/PDF lên Kho tài liệu và lập chỉ mục. Sau đó, hỏi Gia sư AI và thử một bài luyện thi để lộ trình có dữ liệu học tập.</p>
        <div className="elp-empty-actions"><Link to="/app/documents" className="elp-btn elp-btn-primary">＋ Thêm tài liệu</Link><Link to="/app/ai-tutor" className="elp-btn elp-btn-outline">✦ Hỏi Gia sư AI</Link></div>
      </section>}

      {!loading && plan && plan.priorities.length > 0 && <>
        <section className="elp-stats" aria-label="Tổng quan lộ trình">
          <div className="elp-stat"><span className="elp-stat-icon">◷</span><span>Thời gian mỗi ngày</span><strong>{plan.dailyMinutes} phút</strong><small>Thời lượng mục tiêu</small></div>
          <div className="elp-stat"><span className="elp-stat-icon">▦</span><span>Kế hoạch học tập</span><strong>{plan.days} ngày</strong><small>{totalTasks} nhiệm vụ trong lịch</small></div>
          <div className="elp-stat"><span className="elp-stat-icon">▤</span><span>Tài liệu ưu tiên</span><strong>{plan.priorities.length}</strong><small>Dựa trên dữ liệu thực tế</small></div>
          <div className="elp-stat elp-stat-highlight"><span className="elp-stat-icon">✓</span><span>Hoàn thành hôm nay</span><strong>{todayProgress.completed}/{todayProgress.total}</strong><small>{percentToday}% nhiệm vụ hôm nay</small><div className="elp-stat-bar"><span style={{ width: `${percentToday}%` }} /></div></div>
        </section>

        {plan.insights && (
          <section className="elp-intelligence" aria-label="Phân tích tiến độ học tập">
            <article className="elp-card elp-insight-card">
              <span className="elp-eyebrow">PHÂN TÍCH THEO KẾT QUẢ THẬT</span>
              <h2>Tiến độ của bạn</h2>
              <div className="elp-insight-metrics">
                <div><strong>{plan.insights.streakDays}</strong><span>ngày học liên tiếp*</span></div>
                <div><strong>{plan.insights.activeDaysLast7Days}/7</strong><span>ngày có đánh dấu hoàn thành</span></div>
                <div><strong>{plan.insights.completedTasksLast7Days}</strong><span>nhiệm vụ đã đánh dấu / 7 ngày</span></div>
                <div><strong>{plan.insights.readyDocuments}/{plan.insights.totalDocuments}</strong><span>tài liệu sẵn sàng</span></div>
              </div>
              <p className="elp-helper">*Chuỗi ngày tính theo ngày có ít nhất một nhiệm vụ bạn tự xác nhận; hôm nay chưa học vẫn giữ chuỗi nếu hôm qua có học.</p>
            </article>
            <article className="elp-card elp-insight-card">
              <span className="elp-eyebrow">XU HƯỚNG LUYỆN THI</span>
              <h2>{plan.insights.averageScoreLast3 === null ? "Chưa đủ kết quả luyện thi" : `${plan.insights.averageScoreLast3}% điểm trung bình gần đây`}</h2>
              <p className="elp-trend-line">
                {plan.insights.scoreTrendPoints === null
                  ? "Cần ít nhất 4 bài đã nộp có điểm để so sánh xu hướng."
                  : `So với nhóm bài trước: ${plan.insights.scoreTrendPoints > 0 ? "+" : ""}${plan.insights.scoreTrendPoints} điểm phần trăm`}
              </p>
              <div className="elp-insight-next">
                <strong>Gợi ý bước tiếp theo</strong>
                <span>{plan.insights.nextStep}</span>
                <a href="#elp-week">Xem nhiệm vụ hôm nay ↗</a>
              </div>
            </article>
          </section>
        )}

        {plan.history && plan.history.length > 0 && (
          <section className="elp-card elp-history" aria-label="Nhật ký hoàn thành 7 ngày">
            <div className="elp-section-head">
              <div><span className="elp-eyebrow">NHẬT KÝ HỌC TẬP</span><h2>7 ngày gần nhất</h2>
                <p>Số nhiệm vụ tự đánh dấu hoàn thành mỗi ngày (không phải số giờ học thực tế).</p>
              </div>
            </div>
            <div className="elp-history-bars">
              {plan.history.map((item) => (
                <div className="elp-history-day" key={item.date} title={`${formatFullDate(item.date)}: ${item.completedTasks} nhiệm vụ`}>
                  <strong>{item.completedTasks}</strong>
                  <div className="elp-history-track"><span style={{height: `${Math.max(4, Math.min(100, (item.completedTasks / 3) * 100))}%`}} /></div>
                  <small>{formatShortDate(item.date)}</small>
                </div>
              ))}
            </div>
            <p className="elp-helper">Lịch sử được đọc từ MySQL. Kế hoạch 7 ngày phía dưới được tính lại khi kết quả luyện thi thay đổi, không phải lịch sử đã khóa cố định.</p>
          </section>
        )}

        <div className="elp-content-grid">
          <section className="elp-card elp-priorities" aria-labelledby="elp-priorities-title">
            <div className="elp-section-head">
              <div><span className="elp-eyebrow">HỌC ĐÚNG TRỌNG TÂM</span><h2 id="elp-priorities-title">Tài liệu nên ưu tiên</h2><p>Thứ tự được hệ thống đề xuất từ chỉ số luyện tập và trạng thái tài liệu.</p></div>
              <Link to="/app/documents" className="elp-text-link">Kho tài liệu ↗</Link>
            </div>
            <div className="elp-filter-row" role="group" aria-label="Lọc tài liệu ưu tiên">
              {([
                ["all", "Tất cả"],
                ["review", "Có câu sai"],
                ["index", "Cần xử lý"],
              ] as [PriorityFilter, string][]).map(([value, label]) => (
                <button type="button" key={value} aria-pressed={priorityFilter === value} className={priorityFilter === value ? "is-active" : ""} onClick={() => { setPriorityFilter(value); setShowAllPriorities(false); }}>{label}</button>
              ))}
            </div>
            <div className="elp-priority-list">
              {visiblePriorities.length === 0 && <p className="elp-no-results">Không có tài liệu phù hợp với bộ lọc này.</p>}
              {visiblePriorities.map((item) => (
                <article className="elp-priority" key={item.documentId}>
                  <span className="elp-priority-number" aria-hidden="true">▤</span>
                  <div className="elp-priority-body">
                    <div className="elp-priority-title"><h3 title={item.documentName}>{item.documentName}</h3><span className="elp-priority-badge">Ưu tiên {item.priorityScore}</span></div>
                    <p>{item.reason}</p>
                    {item.recommendedAction && <p className="elp-next-action">→ {item.recommendedAction}</p>}
                    <div className="elp-chips"><span>{item.submittedQuizzes} bài đã nộp</span><span>{item.latestScorePercent === null ? "Chưa có điểm" : `Điểm gần nhất ${item.latestScorePercent}%`}</span><span>{item.wrongAnswersLast30Days} câu sai/30 ngày</span>{item.trendDeltaPoints !== null && item.trendDeltaPoints !== undefined && <span>Xu hướng {item.trendDeltaPoints > 0 ? "+" : ""}{item.trendDeltaPoints} điểm</span>}<span className={item.indexed ? "elp-chip-ready" : "elp-chip-warn"}>{item.indexed ? "✓ Đã xử lý" : "! Cần lập chỉ mục"}</span></div>
                  </div>
                </article>
              ))}
            </div>
            {plan.priorities.filter((item) => priorityFilter === "all" || (priorityFilter === "review" ? item.wrongAnswersLast30Days > 0 : !item.indexed)).length > 4 &&
              <button type="button" className="elp-show-more" onClick={() => setShowAllPriorities((value) => !value)}>{showAllPriorities ? "Thu gọn ↑" : "Xem thêm tài liệu ↓"}</button>}
          </section>

          <section className="elp-card elp-today" aria-labelledby="elp-today-title">
            <div className="elp-section-head"><div><span className="elp-eyebrow">NHIỆM VỤ HÔM NAY</span><h2 id="elp-today-title">Bắt đầu từ việc nhỏ</h2></div><span className="elp-small-tag">{formatShortDate(plan.startDate)}</span></div>
            <div className="elp-today-progress"><strong>{percentToday}%</strong><span>đã hoàn thành</span><div className="elp-progress-track"><span style={{ width: `${percentToday}%` }} /></div><small>{todayProgress.completed} trên {todayProgress.total} nhiệm vụ</small></div>
            <p className="elp-helper">Chỉ nhiệm vụ hôm nay có thể đánh dấu hoàn thành; dữ liệu được lưu qua API hiện có.</p>
            <a href="#elp-week" className="elp-btn elp-btn-primary">Xem việc cần làm ↓</a>
          </section>
        </div>

        <section id="elp-week" className="elp-card elp-week" aria-labelledby="elp-week-title">
          <div className="elp-section-head"><div><span className="elp-eyebrow">LỊCH HỌC CÁ NHÂN HÓA</span><h2 id="elp-week-title">Lộ trình {plan.days} ngày của bạn</h2><p>Kế hoạch được cân bằng giữa môn ưu tiên cao và ôn lặp lại cách quãng; mỗi ngày gồm ba hoạt động.</p></div><span className="elp-small-tag">{plan.dailyMinutes} phút/ngày</span></div>
          <div className="elp-day-tabs" role="group" aria-label="Chọn ngày trong lộ trình">
            {plan.schedule.map((day, index) => {
              const dayProgress = getDayProgress(day);
              return <button key={day.date} type="button" className={`elp-day-tab ${selectedDay?.date === day.date ? "is-active" : ""}`}
                aria-pressed={selectedDay?.date === day.date} onClick={() => { setSelectedDate(day.date); setTaskFilter("all"); }}>
                <span>{day.date === plan.startDate ? "Hôm nay" : `Ngày ${index + 1}`}</span><strong>{formatShortDate(day.date)}</strong><small>{dayProgress.completed}/{dayProgress.total} nhiệm vụ</small>
              </button>;
            })}
          </div>
          {selectedDay && <div className="elp-day-detail">
            <div className="elp-day-heading"><div><span className="elp-eyebrow">{canCompleteSelected ? "ƯU TIÊN HÔM NAY" : "KẾ HOẠCH THAM KHẢO"}</span><h3>{formatFullDate(selectedDay.date)}</h3><p>▤ {selectedDay.documentName}</p>
              {selectedDay.focusReason && <p className="elp-focus-reason">Lý do xếp lịch: {selectedDay.focusReason}</p>}
              </div><span className="elp-day-count">{getDayProgress(selectedDay).completed}/{selectedDay.tasks.length} hoàn thành</span></div>
            <div className="elp-time-allocation" aria-label="Phân bổ thời gian trong ngày">
              <strong>{selectedDay.tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0)} phút</strong>
              <div className="elp-time-segments">
                {selectedDay.tasks.map((task) => <span key={task.kind} title={`${task.title}: ${task.estimatedMinutes} phút`}
                  style={{ flexGrow: task.estimatedMinutes }} />)}
              </div>
              <small>{selectedDay.tasks.map((task) => `${task.title}: ${task.estimatedMinutes}′`).join(" · ")}</small>
            </div>
            {!canCompleteSelected && <div className="elp-info">Bạn có thể xem trước nhiệm vụ và mở khu vực học tập. Hệ thống chỉ hỗ trợ đánh dấu hoàn thành cho ngày hôm nay.</div>}
            {taskError && <p className="elp-task-error" role="alert">{taskError}</p>}
            <div className="elp-filter-row" role="group" aria-label="Lọc nhiệm vụ">
              {([ ["all", "Tất cả"], ["pending", "Chưa xong"], ["done", "Đã xong"] ] as [TaskFilter, string][]).map(([value, label]) => (
                <button type="button" key={value} aria-pressed={taskFilter === value} className={taskFilter === value ? "is-active" : ""} onClick={() => setTaskFilter(value)}>{label}</button>
              ))}
            </div>
            <div className="elp-task-list">
              {visibleTasks.length === 0 && <p className="elp-no-results">Không có nhiệm vụ trong bộ lọc này.</p>}
              {visibleTasks.map((task) => (
                <article className={`elp-task ${task.completed ? "is-complete" : ""}`} key={`${selectedDay.date}-${task.kind}`}>
                  <label className="elp-check" title={canCompleteSelected ? "Đánh dấu hoàn thành" : "Chỉ đánh dấu được việc hôm nay"}>
                    <input type="checkbox" checked={task.completed} disabled={!canCompleteSelected || Boolean(saving)}
                      onChange={(event) => void toggleTask(selectedDay, task.kind, event.target.checked)} aria-label={`Hoàn thành: ${task.title}`} />
                  </label>
                  <div className="elp-task-main"><h4>{task.title}</h4><p>{task.detail}</p><small>◷ Khoảng {task.estimatedMinutes} phút</small></div>
                  <Link className="elp-task-action" to={task.path}>Bắt đầu ↗</Link>
                </article>
              ))}
            </div>
          </div>}
        </section>

        <div className="elp-extras"><DailyNote key={noteKey} storageKey={noteKey} /><FocusTimer /></div>

        <section className="elp-card elp-advice" aria-labelledby="elp-advice-title">
          <div className="elp-advice-heading"><div><span className="elp-eyebrow">GỢI Ý HỌC TẬP THÔNG MINH</span><h2 id="elp-advice-title">Nhận lời khuyên từ Gia sư AI</h2><p>AI dựa trên dữ liệu điểm thi và tài liệu hiện có. Lịch học bên trên vẫn sử dụng được khi AI không hoạt động.</p></div>
            <button type="button" className="elp-btn elp-btn-primary" onClick={() => void askAdvice()} disabled={adviceBusy || loading}>{adviceBusy ? "Đang phân tích…" : "✦ Nhận gợi ý AI"}</button></div>
          {adviceError && <p className="elp-task-error" role="alert">{adviceError}</p>}
          {advice && <div className="elp-advice-result" aria-live="polite">{advice}</div>}
        </section>
        <p className="elp-footnote">{plan.note} Khi nộp bài luyện thi mới, chọn “Làm mới” để cập nhật lộ trình. Lịch học là đề xuất cuốn chiếu, không lưu lại kế hoạch từng ngày làm bản chụp cố định. Thời gian tập trung và ghi chú cá nhân không được tính vào thống kê trên server.</p>
      </>}
    </div>
  );
}
