import { authenticatedFetch } from "./authService";
import { apiJson, ensureApiSuccess } from "./apiClient";

export interface DocumentItem {
  id: number;
  subjectId: number;
  originalFileName: string;
  sizeBytes: number;
  status: string;
  contentType?: string;
  createdAtUtc: string;
}

const API_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5080";

// Lấy danh sách tài liệu
export function getDocuments(): Promise<DocumentItem[]> {
  return apiJson<DocumentItem[]>("/api/documents");
}

// Tải PDF hoặc Word .docx lên Backend
export async function uploadDocument(
  file: File,
  subjectId: number,
  signal?: AbortSignal
): Promise<DocumentItem> {
  const formData = new FormData();

  formData.append("file", file);
  formData.append("subjectId", String(subjectId));

  const response = await authenticatedFetch(`${API_URL}/api/documents`, {
    method: "POST",
    body: formData,
    signal,
  });

  await ensureApiSuccess(response, "Tải tài liệu thất bại.");

  return (await response.json()) as DocumentItem;
}


export function getDocumentFileUrl(id: number): string {
  return `/app/pdf/${id}`;
}

export function isWordDocument(document: Pick<DocumentItem, "originalFileName">): boolean {
  return document.originalFileName.toLowerCase().endsWith(".docx");
}

// D5: queued indexing is independent from the HTTP upload request.
export interface IndexJobStatus { documentId: number; status: string; chunkCount?: number }
export async function enqueueDocumentIndex(documentId: number): Promise<IndexJobStatus> {
  const response = await authenticatedFetch(`${API_URL}/api/documents/${documentId}/index/background`, {
    method: "POST",
  });
  await ensureApiSuccess(response, "Không thể xếp hàng lập chỉ mục.");
  return (await response.json()) as IndexJobStatus;
}

/** File goc dung Bearer token; khong su dung URL cong khai hoac luu token vao URL. */
export async function fetchDocumentBlob(id: number, signal?: AbortSignal): Promise<Blob> {
  const response = await authenticatedFetch(`/api/documents/${id}/file`, { signal });
  await ensureApiSuccess(response, "Không thể mở file tài liệu.");
  return response.blob();
}

/** Preview text do backend trich xuat toi da 5 phan, moi phan toi da 5000 ky tu. */
export interface DocumentTextPreview {
  documentId: number;
  fileName: string;
  totalPages: number;
  extractedPages: number;
  unit: "page" | "section";
  hasExtractableText: boolean;
  pages: Array<{ pageNumber: number; text: string }>;
}
export function getDocumentTextPreview(id: number, signal?: AbortSignal): Promise<DocumentTextPreview> {
  return apiJson<DocumentTextPreview>(`/api/documents/${id}/text`, { signal });
}
