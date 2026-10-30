const API_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5080").trim().replace(/\/+$/, "");

// Thông báo dễ hiểu hơn khi Backend chưa chạy, sai cổng hoặc bị CORS chặn.
async function authFetch(path: string, body: object): Promise<Response> {
  try {
    return await fetch(`${API_URL}/api/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Không kết nối được Backend tại ${API_URL}. Hãy kiểm tra Backend đang chạy cổng 5080 và cấu hình CORS.`, { cause: error });
    }
    throw error;
  }
}

const TOKEN_KEY = "edumind_development_token";

export interface SignedInUser {
  id: string;
  email: string;
  role: "Student" | "Admin";
}

export function accessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearAccessToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function saveAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

// Bước 17 dùng Bearer token có thời hạn từ ASP.NET Core Identity.
// Chưa dùng refresh token để giảm nơi lưu bí mật; hết hạn thì đăng nhập lại.
export async function authenticatedFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = accessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url.startsWith("/api/") ? `${API_URL}${url}` : url, {
    ...init,
    headers,
  });
  if (response.status === 401) {
    clearAccessToken();
    window.dispatchEvent(new Event("edumind-auth-expired"));
  }
  return response;
}

export async function fetchCurrentUser(): Promise<SignedInUser> {
  const response = await authenticatedFetch("/api/auth/me");
  if (!response.ok) throw new Error("Phiên đăng nhập không hợp lệ.");
  return (await response.json()) as SignedInUser;
}

export async function signIn(email: string, password: string): Promise<SignedInUser> {
  const response = await authFetch("login", { email, password });
  if (!response.ok) {
    if (response.status === 429) throw new Error("Bạn đăng nhập quá nhiều lần. Hãy thử lại sau ít phút.");
    const payload = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(payload.message || "Email hoặc mật khẩu không đúng, hoặc tài khoản đang bị khóa.");
  }
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" ||
      typeof (payload as { accessToken?: unknown }).accessToken !== "string") {
    throw new Error("Backend không trả về accessToken.");
  }
  saveAccessToken((payload as { accessToken: string }).accessToken);
  try { return await fetchCurrentUser(); }
  catch (error) { clearAccessToken(); throw error; }
}

export async function signUp(email: string, password: string): Promise<void> {
  const response = await authFetch("signup", { email, password });
  if (!response.ok) {
    const raw = await response.text();
    let message = "Đăng ký thất bại. Hãy kiểm tra email và mật khẩu.";
    try {
      const payload = JSON.parse(raw) as { message?: string; errors?: Record<string, string[]> | string[] };
      if (response.status === 429) message = "Bạn thao tác quá nhiều lần. Hãy thử lại sau ít phút.";
      else if (Array.isArray(payload.errors)) message = payload.errors.join(" ");
      else if (payload.errors) message = Object.values(payload.errors).flat().join(" ");
      else if (payload.message) message = payload.message;
    } catch { /* Identity may return plain text */ }
    throw new Error(message);
  }
  // Sau khi đăng ký, người dùng vào /login; không cần xác minh email.
}
