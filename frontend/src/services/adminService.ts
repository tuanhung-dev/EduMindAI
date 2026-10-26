import { authenticatedFetch } from "./authService";

export interface AdminSummary {
  totalUsers: number;
  verifiedUsers: number;
  suspendedUsers: number;
  adminUsers: number;
  subjects: number;
  documents: number;
  orphanDocuments: number;
  quizzes: number;
  completedAttempts: number;
  averageScore: number;
}
export interface AdminDay { date: string; completedAttempts: number; }
export interface AdminDashboard {
  summary: AdminSummary;
  recentActivity: AdminDay[];
  note: string;
}
export interface AdminUser {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
  accessFailedCount: number;
  suspended: boolean;
  role: "Student" | "Admin";
}
export interface UserPage {
  items: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message || `Không thực hiện được (HTTP ${response.status}).`);
  }
  return await response.json() as T;
}
export async function getAdminDashboard(): Promise<AdminDashboard> {
  return readJson<AdminDashboard>(await authenticatedFetch("/api/admin/dashboard"));
}
export async function getAdminUsers(search = "", page = 1): Promise<UserPage> {
  const query = new URLSearchParams({ search, page: String(page), pageSize: "15" });
  return readJson<UserPage>(await authenticatedFetch(`/api/admin/users?${query.toString()}`));
}
export async function setAdminUserStatus(id: string, suspended: boolean): Promise<void> {
  await readJson<{ message: string }>(await authenticatedFetch(`/api/admin/users/${encodeURIComponent(id)}/status`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suspended }),
  }));
}
export async function setAdminUserRole(id: string, role: "Student" | "Admin"): Promise<void> {
  await readJson<{ message: string }>(await authenticatedFetch(`/api/admin/users/${encodeURIComponent(id)}/role`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  }));
}
