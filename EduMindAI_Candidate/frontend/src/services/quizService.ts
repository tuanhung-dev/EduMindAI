import { authenticatedFetch } from "./authService";
const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5080";

export type QuizDifficulty = "easy" | "medium" | "hard";

export interface QuizListItem {
  id: number;
  documentId: number;
  documentName: string;
  title: string;
  difficulty: QuizDifficulty;
  questionCount: number;
  isPartialSource: boolean;
  createdAtUtc: string;
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

export interface QuizDetail extends Omit<QuizListItem, "questionCount"> {
  questions: QuizQuestionPreview[];
}

export interface GenerateQuizResult {
  quizId: number;
  documentId: number;
  title: string;
  difficulty: QuizDifficulty;
  questionCount: number;
  isPartialSource: boolean;
  message: string;
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(`${API_URL}${url}`, init);
  const raw = await response.text();
  let body: unknown;
  try { body = JSON.parse(raw); } catch { body = raw; }
  if (!response.ok) {
    let message = typeof body === "string" && body ? body : `API lỗi HTTP ${response.status}`;
    if (body && typeof body === "object") {
      const error = body as Record<string, unknown>;
      message = typeof error.message === "string" ? error.message : message;
      if (typeof error.upstreamStatus === "number") message += ` (OpenAI HTTP ${error.upstreamStatus})`;
      if (typeof error.upstreamMessage === "string") message += `: ${error.upstreamMessage}`;
      if (typeof error.errorParam === "string" && error.errorParam) message += ` [param: ${error.errorParam}]`;
    }
    throw new Error(message);
  }
  return body as T;
}

export function listQuizzes(): Promise<QuizListItem[]> {
  return apiJson<QuizListItem[]>("/api/quizzes");
}

export function getQuiz(id: number): Promise<QuizDetail> {
  return apiJson<QuizDetail>(`/api/quizzes/${id}`);
}

export function generateQuiz(documentId: number, questionCount: 5 | 10,
  difficulty: QuizDifficulty, topic = ""): Promise<GenerateQuizResult> {
  return apiJson<GenerateQuizResult>("/api/quizzes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId, questionCount, difficulty, topic }),
  });
}

// Bước 15 - lượt làm bài. Đáp án đúng chỉ có trong GET khi đã nộp.
export type AnswerOption = "A" | "B" | "C" | "D";

export interface QuizAttemptSummary {
  id: number;
  quizId: number;
  startedAtUtc: string;
  submittedAtUtc: string | null;
  totalQuestions: number;
  correctCount: number | null;
  scorePercent: number | null;
}

export interface AttemptQuestion extends Omit<QuizQuestionPreview, "sourcePageNumber"> {
  selectedOption: AnswerOption | null;
  correctOption: AnswerOption | null;
  isCorrect: boolean | null;
  explanation: string | null;
  sourcePageNumber: number | null;
  sourceExcerpt: string | null;
}

export interface QuizAttemptDetail extends QuizAttemptSummary {
  quizTitle: string;
  documentId: number;
  documentName: string | null;
  questions: AttemptQuestion[];
}

export interface StartQuizAttemptResult {
  attemptId: number;
  quizId: number;
  startedAtUtc: string;
  totalQuestions: number;
  message: string;
}

export interface SubmitQuizAttemptResult {
  attemptId: number;
  correctCount: number;
  totalQuestions: number;
  scorePercent: number;
  submittedAtUtc: string;
  message: string;
}

export function startQuizAttempt(quizId: number): Promise<StartQuizAttemptResult> {
  return apiJson<StartQuizAttemptResult>(`/api/quizzes/${quizId}/attempts`, { method: "POST" });
}

export function listQuizAttempts(quizId: number): Promise<QuizAttemptSummary[]> {
  return apiJson<QuizAttemptSummary[]>(`/api/quizzes/${quizId}/attempts`);
}

export function getQuizAttempt(attemptId: number): Promise<QuizAttemptDetail> {
  return apiJson<QuizAttemptDetail>(`/api/attempts/${attemptId}`);
}

export function submitQuizAttempt(attemptId: number,
  answers: Array<{ questionId: number; selectedOption: AnswerOption | null }>,
): Promise<SubmitQuizAttemptResult> {
  return apiJson<SubmitQuizAttemptResult>(`/api/attempts/${attemptId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
}
