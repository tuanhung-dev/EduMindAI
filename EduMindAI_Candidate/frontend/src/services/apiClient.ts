import { authenticatedFetch } from "./authService";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5080").trim().replace(/\/+$/, "");

export class ApiRequestError extends Error {
  readonly status: number;
  readonly path: string;
  constructor(message: string, status: number, path: string) {
    super(message);
    this.status = status;
    this.path = path;
    this.name = "ApiRequestError";
  }
}

export function apiErrorMessage(error: unknown, fallback = "Yêu cầu không thành công."): string {
  if (error instanceof Error && error.name === "AbortError") return "Đã hủy yêu cầu.";
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

/** Gộp lỗi JSON/ProblemDetails/text và HTTP 401/403/429/5xx vào một cách hiển thị. */
export async function explainHttpError(response: Response, fallback = "Yêu cầu không thành công."): Promise<string> {
  if (response.status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  const generic: Record<number, string> = {
    400: "Dữ liệu yêu cầu không hợp lệ.",
    403: "Bạn không có quyền sử dụng chức năng này hoặc chức năng chưa được bật.",
    404: "Không tìm thấy dữ liệu yêu cầu.",
    408: "Yêu cầu quá thời gian xử lý.",
    409: "Dữ liệu đã thay đổi. Hãy làm mới và thử lại.",
    413: "Tệp tải lên quá lớn.",
    429: "Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.",
    500: "Máy chủ gặp sự cố. Hãy thử lại sau.",
    502: "Máy chủ trung gian đang gặp lỗi.",
    503: "Dịch vụ hiện không sẵn sàng. Hãy thử lại sau.",
  };
  const defaultMessage = generic[response.status] || `${fallback} (HTTP ${response.status}).`;
  try {
    const raw = (await response.clone().text()).trim();
    if (!raw) return defaultMessage;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("json") || raw.startsWith("{")) {
      const body: unknown = JSON.parse(raw);
      if (body && typeof body === "object") {
        const obj = body as Record<string, unknown>;
        if (typeof obj.message === "string" && obj.message.trim()) return obj.message.slice(0, 800);
        if (typeof obj.title === "string" && obj.title.trim() && response.status < 500) return obj.title.slice(0, 500);
        if (obj.errors && typeof obj.errors === "object" && response.status === 400) {
          const text = Object.values(obj.errors).flat().filter((v): v is string => typeof v === "string").join(" ");
          if (text) return text.slice(0, 800);
        }
      }
      return defaultMessage;
    }
    // Khong dua trang HTML loi / stacktrace server ra giao dien.
    if (response.status < 500 && raw.length < 300 && !/[<>]/.test(raw)) return raw;
  } catch { /* Khong lam hong thong bao mac dinh neu response khong phai JSON. */ }
  return defaultMessage;
}

export async function ensureApiSuccess(response: Response, fallback?: string): Promise<Response> {
  if (response.ok) return response;
  throw new ApiRequestError(await explainHttpError(response, fallback), response.status, new URL(response.url || API_BASE_URL).pathname);
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(path.startsWith("http") ? path : `/api/${path.replace(/^\/?api\/?/, "")}`, init);
  await ensureApiSuccess(response);
  try { return await response.json() as T; }
  catch { throw new Error("Máy chủ trả về dữ liệu không đúng định dạng JSON."); }
}
