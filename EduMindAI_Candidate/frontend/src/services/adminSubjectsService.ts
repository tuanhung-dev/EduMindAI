import { authenticatedFetch } from "./authService";
import type { Subject } from "./subjectService";

/** Các trường đúng hợp đồng SubjectRequest của backend hiện có. */
export interface SubjectPayload {
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

async function request<T>(path: string, method: "POST" | "PUT" | "DELETE", payload?: SubjectPayload): Promise<T> {
  const response = await authenticatedFetch(path, {
    method,
    ...(payload ? {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    } : {}),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json() as {
        message?: string;
        title?: string;
        errors?: Record<string, string[]>;
      };
      detail = body.message ||
        (body.errors ? Object.values(body.errors).flat().join(" ") : "") ||
        body.title || "";
    } catch { /* Có API trả lỗi rỗng hoặc plain text. */ }

    if (response.status === 401) throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    if (response.status === 403) throw new Error("Bạn không có quyền quản lý môn học.");
    if (response.status === 404) throw new Error("Môn học không còn tồn tại. Hãy làm mới danh sách.");
    if (response.status === 409) throw new Error(detail || "Mã môn học đã tồn tại hoặc dữ liệu đang xung đột.");
    if (response.status === 429) throw new Error("Bạn đang thao tác quá nhanh. Vui lòng thử lại sau.");
    if (response.status >= 500) throw new Error("Máy chủ không thực hiện được thao tác. Môn học có thể đang được sử dụng; hãy kiểm tra dữ liệu liên quan hoặc thử lại.");
    throw new Error(detail || `Không thực hiện được yêu cầu (HTTP ${response.status}).`);
  }

  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function createAdminSubject(payload: SubjectPayload): Promise<Subject> {
  return request<Subject>("/api/subjects", "POST", payload);
}

export function updateAdminSubject(id: number, payload: SubjectPayload): Promise<Subject> {
  return request<Subject>(`/api/subjects/${id}`, "PUT", payload);
}

export function deleteAdminSubject(id: number): Promise<void> {
  return request<void>(`/api/subjects/${id}`, "DELETE");
}
