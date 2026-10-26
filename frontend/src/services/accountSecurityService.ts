import { authenticatedFetch } from "./authService";

const API_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5080";

type ServerMessage = { message?: string };

async function parseResult(response: Response): Promise<string> {
  const payload: ServerMessage = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 429) throw new Error("Bạn thao tác quá nhiều lần. Hãy thử lại sau ít phút.");
    throw new Error(payload.message || "Thao tác không thành công. Hãy thử lại.");
  }
  return payload.message || "Thành công.";
}

async function publicPost(path: string, data: object): Promise<string> {
  const response = await fetch(`${API_URL}/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return parseResult(response);
}

export const resendConfirmation = (email: string) => publicPost("resend-confirmation", { email });
export const requestPasswordReset = (email: string) => publicPost("forgot-password", { email });
export const confirmEmail = (userId: string, code: string) => publicPost("confirm-email", { userId, code });
export const resetPassword = (email: string, code: string, newPassword: string) =>
  publicPost("reset-password", { email, code, newPassword });

export async function changePassword(currentPassword: string, newPassword: string): Promise<string> {
  return parseResult(await authenticatedFetch("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  }));
}
