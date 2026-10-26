import { authenticatedFetch } from "./authService";
import { getDocumentFileUrl } from "./documentService";

const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5080";

export interface AiSource {
  pageNumber: number;
  chunkIndex: number;
  excerpt: string;
}

export interface AiAnswer {
  documentId?: number;
  question?: string;
  answer: string;
  sources: AiSource[];
}

export interface AiSummary {
  documentId: number;
  level: "short" | "detailed";
  summary: string;
  coverage: {
    totalChunks: number;
    sampledChunks: number;
    isPartial: boolean;
    pages: number[];
    note: string;
  };
  sources: AiSource[];
}

export interface IndexResult {
  documentId: number;
  totalPages: number;
  chunkCount: number;
  status: string;
  message?: string;
}

/** Hỗ trợ lỗi JSON của API và lỗi dạng text ở giai đoạn Development. */
async function requireOk(response: Response): Promise<void> {
  if (response.ok) return;

  const text = await response.text();
  let message = text || `Yêu cầu thất bại (HTTP ${response.status}).`;
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object") {
      const info = body as Record<string, unknown>;
      const baseMessage = typeof info.message === "string" ? info.message : message;
      const upstream = typeof info.upstreamMessage === "string" ? info.upstreamMessage : "";
      const status = typeof info.upstreamStatus === "number" ? ` (OpenAI HTTP ${info.upstreamStatus})` : "";
      const parameter = typeof info.errorParam === "string" ? ` [tham số: ${info.errorParam}]` : "";
      const errorCode = typeof info.errorCode === "string" ? ` [mã: ${info.errorCode}]` : "";
      const contentType = typeof info.upstreamContentType === "string"
        ? ` [kiểu phản hồi: ${info.upstreamContentType}]` : "";
      const requestId = typeof info.upstreamRequestId === "string"
        ? ` [Request ID: ${info.upstreamRequestId}]` : "";
      message = `${baseMessage}${status}${upstream ? `: ${upstream}` : ""}${parameter}${errorCode}${contentType}${requestId}`;
    }
  } catch {
    // Trả về thông báo dạng text khi response không phải JSON.
  }
  throw new Error(message);
}

export async function indexDocument(documentId: number): Promise<IndexResult> {
  const response = await authenticatedFetch(`${API_URL}/api/documents/${documentId}/index`, {
    method: "POST",
  });
  await requireOk(response);
  return (await response.json()) as IndexResult;
}

export async function askDocument(documentId: number, question: string): Promise<AiAnswer> {
  const response = await authenticatedFetch(`${API_URL}/api/ai/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId, question }),
  });
  await requireOk(response);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") {
    throw new Error("Dữ liệu trả lời từ AI không hợp lệ.");
  }
  const data = payload as Partial<AiAnswer>;
  if (typeof data.answer !== "string") {
    throw new Error("API chưa trả về nội dung câu trả lời.");
  }
  return { ...data, answer: data.answer, sources: Array.isArray(data.sources) ? data.sources : [] };
}

export function getPdfAtPage(documentId: number, pageNumber: number): string {
  const page = Math.max(1, Math.floor(pageNumber));
  return `${getDocumentFileUrl(documentId)}#page=${page}`;
}

/** Bước 13: API tóm tắt tài liệu theo các chunks đã lập chỉ mục. */
export async function summarizeDocument(
  documentId: number,
  level: "short" | "detailed",
): Promise<AiSummary> {
  const response = await authenticatedFetch(`${API_URL}/api/documents/${documentId}/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level }),
  });
  await requireOk(response);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" ||
      typeof (data as Partial<AiSummary>).summary !== "string" ||
      !(data as Partial<AiSummary>).coverage) {
    throw new Error("API tóm tắt trả về dữ liệu không hợp lệ.");
  }
  return data as AiSummary;
}
