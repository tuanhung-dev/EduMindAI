import { authenticatedFetch } from "./authService";

export interface Subject {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAtUtc: string;
}

const API_URL =
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:5080";

export async function getSubjects(): Promise<Subject[]> {
  const response = await authenticatedFetch(
    `${API_URL}/api/subjects`
  );

  if (!response.ok) {
    throw new Error("Khong the tai danh sach mon hoc");
  }

  return await response.json() as Subject[];
}
