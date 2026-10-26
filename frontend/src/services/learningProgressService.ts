import { authenticatedFetch } from "./authService";
const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5080";

export interface LearningSummary {
  completedAttempts: number;
  averageScorePercent: number;
  bestScorePercent: number;
  correctAnswers: number;
  totalQuestions: number;
  weightedAccuracyPercent: number;
  practicedDocuments: number;
}

export interface DocumentProgress {
  documentId: number;
  documentName: string;
  completedAttempts: number;
  averageScorePercent: number;
  bestScorePercent: number;
  lastSubmittedAtUtc: string | null;
}

export interface ScoreEntry {
  attemptId: number;
  quizId: number;
  quizTitle: string;
  documentId: number;
  documentName: string;
  scorePercent: number;
  correctCount: number;
  totalQuestions: number;
  submittedAtUtc: string;
}

export interface ReviewPage {
  documentId: number;
  documentName: string;
  pageNumber: number;
  incorrectCount: number;
  sourceExcerpt: string;
}

export interface LearningProgress {
  documentId: number | null;
  summary: LearningSummary;
  byDocument: DocumentProgress[];
  scoreTrend: ScoreEntry[];
  recentAttempts: ScoreEntry[];
  reviewPages: ReviewPage[];
  methodology: {
    scoreTrendLimit: number;
    reviewAttemptLimit: number;
    reviewAttemptsConsidered: number;
    reviewMeaning: string;
  };
}

export async function getLearningProgress(documentId?: number): Promise<LearningProgress> {
  const url = `${API_URL}/api/learning/progress${documentId ? `?documentId=${documentId}` : ""}`;
  const response = await authenticatedFetch(url);
  const raw = await response.text();
  let body: unknown;
  try { body = JSON.parse(raw); } catch { body = null; }
  if (!response.ok) {
    const error = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const message = typeof error.message === "string" ? error.message : `Không tải được tiến độ (HTTP ${response.status}).`;
    throw new Error(message);
  }
  if (!body || typeof body !== "object" || !("summary" in body)) {
    throw new Error("Dữ liệu tiến độ không hợp lệ.");
  }
  return body as LearningProgress;
}
