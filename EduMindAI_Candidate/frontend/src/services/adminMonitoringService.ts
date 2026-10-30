import { authenticatedFetch } from "./authService";

export type MonitoringDays = 7 | 30;

export interface DocumentMonitoring {
  total: number;
  ready: number;
  queued: number;
  processing: number;
  failed: number;
  other: number;
  olderThanOneHourPending: number;
  missingOwner: number;
  indexedChunks: number;
}
export interface AiActivity {
  chatSessions: number;
  savedAssistantReplies: number;
  savedSummaries: number;
  generatedQuizzes: number;
  submittedAttempts: number;
}
export interface MonitoringDay {
  date: string;
  chatAnswers: number;
  summaries: number;
  quizzesCreated: number;
  attemptsSubmitted: number;
}
export interface AiRequestCategory {
  kind: string;
  requests: number;
  success: number;
  failed: number;
  averageDurationMs: number;
}
export interface AiRuntimeMetrics {
  startedAtUtc: string;
  requests: number;
  success: number;
  failed: number;
  averageDurationMs: number;
  byCategory: AiRequestCategory[];
  recentFailures: { kind: string; status: number; atUtc: string }[];
}
export interface DocumentIssue {
  id: number;
  originalFileName: string;
  status: string;
  createdAtUtc: string;
}
export interface MonitoringOverview {
  checkedAtUtc: string;
  dbStatus: string;
  provider: string;
  configuredModel: string;
  periodDays: number;
  documents: DocumentMonitoring;
  activity: AiActivity;
  timeline: MonitoringDay[];
  issues: DocumentIssue[];
  runtime: AiRuntimeMetrics;
  methodology: { note: string; statusNote: string; streamingNote: string };
}
export interface AiProbe {
  checkedAtUtc: string;
  provider: string;
  configuredModel: string;
  status: "online" | "model_missing" | "offline" | "not_checked" | "invalid_configuration";
  modelAvailable: boolean | null;
  installedModelCount: number | null;
  latencyMs: number | null;
  note: string;
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await authenticatedFetch(path, { signal, cache: "no-store" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Không thể kết nối Backend. Kiểm tra API, CORS và kết nối mạng.", { cause: error });
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message || (
      response.status === 401 ? "Phiên đăng nhập đã hết hạn." :
      response.status === 403 ? "Tài khoản không có quyền Admin." :
      response.status === 503 ? "Máy chủ chưa kết nối được MySQL hoặc dịch vụ giám sát." :
      `Không lấy được dữ liệu giám sát (HTTP ${response.status}).`
    ));
  }
  return await response.json() as T;
}

export function getMonitoringOverview(days: MonitoringDays, signal?: AbortSignal): Promise<MonitoringOverview> {
  return request<MonitoringOverview>(`/api/admin/monitoring/overview?days=${days}`, signal);
}
export function checkAiProvider(signal?: AbortSignal): Promise<AiProbe> {
  return request<AiProbe>("/api/admin/monitoring/ai-status", signal);
}
