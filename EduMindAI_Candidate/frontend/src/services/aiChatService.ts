import { authenticatedFetch } from "./authService";
import type { AiSource } from "./aiTutorService";

const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5080";

export interface AiChatSession {
  id: number;
  documentId: number;
  title: string;
  isPinned: boolean;
  createdAtUtc: string;
  updatedAtUtc: string;
}
export interface AiChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources: AiSource[];
  createdAtUtc: string;
}
export interface AiChatDetail extends AiChatSession { messages: AiChatMessage[]; }

async function checked<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(`${API_URL}${url}`, init);
  if (!response.ok) {
    if (response.status === 404) throw new Error("Không tìm thấy hội thoại hoặc bạn không có quyền truy cập.");
    if (response.status === 401) throw new Error("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.");
    if (response.status === 403) throw new Error("Bạn chưa có quyền sử dụng lịch sử hội thoại.");

    // Backend returns JSON {message, code, traceId}; never display HTML error pages
    // or server stack traces that may contain sensitive information.
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("json")) {
      try {
        const body: unknown = await response.json();
        if (body && typeof body === "object" && "message" in body &&
            typeof body.message === "string" && body.message.trim()) {
          throw new Error(body.message);
        }
      } catch (error) {
        if (error instanceof SyntaxError) { /* Use fallback below for invalid JSON. */ }
        else throw error;
      }
    }
    if (response.status === 500 || response.status === 503) {
      throw new Error(`API hội thoại gặp lỗi (HTTP ${response.status}). Kiểm tra migration MySQL và log Backend.`);
    }
    throw new Error(`Thao tác hội thoại thất bại (HTTP ${response.status}).`);
  }
  return (await response.json()) as T;
}

export function getChats(documentId: number): Promise<AiChatSession[]> {
  return checked<AiChatSession[]>(`/api/ai/chats?documentId=${documentId}`);
}
export function getChat(id: number): Promise<AiChatDetail> {
  return checked<AiChatDetail>(`/api/ai/chats/${id}`);
}
export function renameChat(id: number, title: string): Promise<Pick<AiChatSession, "id" | "title" | "isPinned">> {
  return checked(`/api/ai/chats/${id}/title`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }),
  });
}
export function pinChat(id: number, isPinned: boolean): Promise<Pick<AiChatSession, "id" | "title" | "isPinned">> {
  return checked(`/api/ai/chats/${id}/pin`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPinned }),
  });
}
export async function deleteChat(id: number): Promise<void> {
  const response = await authenticatedFetch(`${API_URL}/api/ai/chats/${id}`, { method: "DELETE" });
  if (!response.ok) {
    if (response.status === 404) throw new Error("Hội thoại không tồn tại hoặc bạn không có quyền xóa.");
    if (response.status === 500 || response.status === 503)
      throw new Error(`Không xóa được hội thoại (HTTP ${response.status}). Kiểm tra migration MySQL và log Backend.`);
    throw new Error(`Không xóa được hội thoại (HTTP ${response.status}).`);
  }
}
