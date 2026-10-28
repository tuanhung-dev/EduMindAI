import { authenticatedFetch } from "./authService";

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
export async function getDocuments(): Promise<DocumentItem[]> {
  const response = await authenticatedFetch(`${API_URL}/api/documents`);

  if (!response.ok) {
    throw new Error("Không thể tải danh sách tài liệu.");
  }

  return (await response.json()) as DocumentItem[];
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

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Tải tài liệu thất bại.");
  }

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
  if (!response.ok) throw new Error(`Không thể xếp hàng lập chỉ mục (HTTP ${response.status}).`);
  return (await response.json()) as IndexJobStatus;
}
