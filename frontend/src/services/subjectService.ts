import { apiJson } from "./apiClient";

export interface Subject {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAtUtc: string;
}

export function getSubjects(): Promise<Subject[]> {
  return apiJson<Subject[]>("/api/subjects");
}
