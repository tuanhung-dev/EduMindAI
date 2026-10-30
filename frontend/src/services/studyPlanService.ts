import { authenticatedFetch } from "./authService";

const API_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5080")
  .trim().replace(/\/+$/, "");

export type DailyMinutes = 30 | 45 | 60 | 90;
export type PlanType = "balanced" | "understanding" | "exam";

export interface StudyTask {
  kind: string;
  title: string;
  detail: string;
  estimatedMinutes: number;
  path: string;
  completed: boolean;
  completedAtUtc: string | null;
}

export interface StudyDay {
  date: string;
  documentId: number;
  documentName: string;
  tasks: StudyTask[];
  focusReason?: string;
}

export interface StudyPriority {
  documentId: number;
  documentName: string;
  priorityScore: number;
  reason: string;
  indexed: boolean;
  submittedQuizzes: number;
  latestScorePercent: number | null;
  wrongAnswersLast30Days: number;
  trendDeltaPoints?: number | null;
  riskLevel?: "prepare" | "high" | "medium" | "low";
  recommendedAction?: string;
}

export interface StudyPlanInsights {
  totalDocuments: number;
  readyDocuments: number;
  weakDocuments: number;
  completedTasksLast7Days: number;
  activeDaysLast7Days: number;
  streakDays: number;
  averageScoreLast3: number | null;
  previousAverageScore3: number | null;
  scoreTrendPoints: number | null;
  nextStep: string;
}

export interface StudyHistoryDay {
  date: string;
  completedTasks: number;
}

export interface StudyPlan {
  generatedAtUtc: string;
  startDate: string;
  dailyMinutes: DailyMinutes;
  days: number;
  method: string;
  planType: PlanType;
  priorities: StudyPriority[];
  schedule: StudyDay[];
  note: string;
  insights?: StudyPlanInsights | null;
  history?: StudyHistoryDay[];
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await authenticatedFetch(`${API_URL}${path}`, init);
  const raw = await response.text();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { value = null; }
  if (!response.ok) {
    const message = value && typeof value === "object" && "message" in value
      ? (value as { message?: unknown }).message : null;
    throw new Error(typeof message === "string" ? message : `Không thể tải lộ trình (HTTP ${response.status}).`);
  }
  return value;
}

export async function getStudyPlan(minutes: DailyMinutes, planType: PlanType = "balanced"): Promise<StudyPlan> {
  const offset = new Date().getTimezoneOffset();
  const value = await requestJson(`/api/learning/study-plan?dailyMinutes=${minutes}&planType=${planType}&timezoneOffsetMinutes=${offset}`);
  if (!value || typeof value !== "object" || !Array.isArray((value as { schedule?: unknown }).schedule)
    || !Array.isArray((value as { priorities?: unknown }).priorities)) {
    throw new Error("Dữ liệu lộ trình từ Backend không hợp lệ.");
  }
  return value as StudyPlan;
}

export async function getAiStudyAdvice(planType: PlanType = "balanced"): Promise<string> {
  const offset = new Date().getTimezoneOffset();
  const value = await requestJson(`/api/learning/study-plan/ai-advice?planType=${planType}&timezoneOffsetMinutes=${offset}`, {
    method: "POST",
  });
  if (!value || typeof value !== "object" || !("advice" in value)
    || typeof (value as { advice?: unknown }).advice !== "string") {
    throw new Error("AI trả lời không đúng định dạng.");
  }
  return (value as { advice: string }).advice;
}

export async function updateStudyTask(date: string, documentId: number,
  kind: StudyTask["kind"], completed: boolean,
  minutes: DailyMinutes = 30, planType: PlanType = "balanced"): Promise<void> {
  await requestJson("/api/learning/study-plan/tasks/completion", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studyDate: date, documentId, kind, completed, dailyMinutes: minutes, planType,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    }),
  });
}
