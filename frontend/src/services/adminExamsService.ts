import { authenticatedFetch } from "./authService";

export type ExamDifficulty = "easy" | "medium" | "hard";

export interface ExamsOverview {
  totalQuizzes: number;
  partialQuizzes: number;
  totalAttempts: number;
  completedAttempts: number;
  openAttempts: number;
  lowScoreAttempts: number;
  averageScore: number;
  recentActivity: Array<{ date: string; completedAttempts: number }>;
  note: string;
}

export interface AdminQuiz {
  id: number;
  documentId: number;
  documentName: string;
  title: string;
  difficulty: ExamDifficulty;
  isPartialSource: boolean;
  createdAtUtc: string;
  ownerUserId: string | null;
  ownerEmail: string | null;
  questionCount: number;
  attemptCount: number;
  submittedCount: number;
}

export interface QuizQuestionPreview {
  id: number;
  position: number;
  content: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  sourcePageNumber: number;
}

export interface AdminQuizDetail extends Omit<AdminQuiz, "questionCount" | "submittedCount"> {
  questions: QuizQuestionPreview[];
}

export interface AdminAttempt {
  id: number;
  quizId: number;
  quizTitle: string;
  documentId: number;
  ownerUserId: string | null;
  ownerEmail: string | null;
  startedAtUtc: string;
  submittedAtUtc: string | null;
  totalQuestions: number;
  correctCount: number | null;
  scorePercent: number | null;
}

export interface ReviewedAnswer {
  id: number;
  position: number;
  content: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: string;
  selectedOption: string | null;
  isCorrect: boolean | null;
  explanation: string;
  sourcePageNumber: number;
  sourceExcerpt: string;
}

export interface AdminAttemptDetail extends AdminAttempt {
  documentName: string;
  questions: ReviewedAnswer[];
}

export interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type QuizQuery = {
  search?: string;
  difficulty?: ExamDifficulty | "all";
  documentId?: string;
  page: number;
};

export type AttemptQuery = {
  search?: string;
  state?: "all" | "submitted" | "open";
  quizId?: string;
  page: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await authenticatedFetch(path, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Không kết nối được máy chủ. Hãy kiểm tra Backend và đường dẫn API.", { cause: error });
  }
  const raw = await response.text();
  let body: unknown = raw;
  try { if (raw) body = JSON.parse(raw) as unknown; } catch { /* Giữ nguyên văn bản thô */ }
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "message" in body &&
      typeof body.message === "string" ? body.message :
        response.status === 401 ? "Phiên đăng nhập đã hết hạn." :
        response.status === 403 ? "Không có quyền Admin hoặc chức năng chưa được bật." :
        response.status === 404 ? "Không tìm thấy dữ liệu." :
        response.status === 409 ? "Thao tác bị từ chối vì có dữ liệu liên quan." :
        response.status === 429 ? "Quá nhiều yêu cầu. Hãy thử lại sau." :
        `Máy chủ không xử lý được yêu cầu (HTTP ${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

function buildQuery(filters: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "" && value !== "all") query.set(key, String(value));
  }
  query.set("pageSize", "15");
  return query.toString();
}

const ROOT = "/api/admin/exams";

export function getExamsOverview(signal?: AbortSignal): Promise<ExamsOverview> {
  return request<ExamsOverview>(`${ROOT}/overview`, { signal });
}

export function listAdminQuizzes(filters: QuizQuery, signal?: AbortSignal): Promise<PagedResponse<AdminQuiz>> {
  return request<PagedResponse<AdminQuiz>>(`${ROOT}/quizzes?${buildQuery(filters)}`, { signal });
}

export function getAdminQuiz(id: number, signal?: AbortSignal): Promise<AdminQuizDetail> {
  return request<AdminQuizDetail>(`${ROOT}/quizzes/${id}`, { signal });
}

export function listAdminAttempts(filters: AttemptQuery, signal?: AbortSignal): Promise<PagedResponse<AdminAttempt>> {
  return request<PagedResponse<AdminAttempt>>(`${ROOT}/attempts?${buildQuery(filters)}`, { signal });
}

export function getAdminAttempt(id: number, signal?: AbortSignal): Promise<AdminAttemptDetail> {
  return request<AdminAttemptDetail>(`${ROOT}/attempts/${id}`, { signal });
}

export function deleteUnusedAdminQuiz(id: number): Promise<{ message: string; id: number }> {
  return request<{ message: string; id: number }>(`${ROOT}/quizzes/${id}`, { method: "DELETE" });
}
