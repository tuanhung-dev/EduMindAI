import { authenticatedFetch } from "./authService";

export interface DocumentItem {
  id: number;
  subjectId: number;
  originalFileName: string;
  sizeBytes: number;
  status: string;
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

// Tải tài liệu PDF lên Backend
export async function uploadDocument(
  file: File,
  subjectId: number
): Promise<DocumentItem> {
  const formData = new FormData();

  formData.append("file", file);
  formData.append("subjectId", String(subjectId));

  const response = await authenticatedFetch(`${API_URL}/api/documents`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Tải PDF thất bại.");
  }

  return (await response.json()) as DocumentItem;
}


export function getDocumentFileUrl(id: number): string {
  return `/app/pdf/${id}`;
}
