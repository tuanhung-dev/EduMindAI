/**
 * Tùy chỉnh hồ sơ CHỈ lưu trong trình duyệt; không đồng bộ lên máy chủ.
 * Email và vai trò do API xác thực quản lý, không cho chỉnh sửa ở đây.
 */
export type AvatarTheme = "forest" | "mint" | "sky";

export interface LocalProfile {
  displayName: string;
  studyGoal: string;
  bio: string;
  avatarTheme: AvatarTheme;
}

export const PROFILE_CHANGED_EVENT = "edumind-local-profile-updated";

const defaults: LocalProfile = {
  displayName: "",
  studyGoal: "",
  bio: "",
  avatarTheme: "forest",
};

const storageKey = (userId: string) => `edumind:profile:v1:${userId}`;

export function readLocalProfile(userId: string | undefined): LocalProfile {
  if (!userId) return { ...defaults };
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return { ...defaults };
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return { ...defaults };
    const value = data as Partial<LocalProfile>;
    return {
      displayName: typeof value.displayName === "string" ? value.displayName.slice(0, 60) : "",
      studyGoal: typeof value.studyGoal === "string" ? value.studyGoal.slice(0, 120) : "",
      bio: typeof value.bio === "string" ? value.bio.slice(0, 240) : "",
      avatarTheme: value.avatarTheme === "mint" || value.avatarTheme === "sky" ? value.avatarTheme : "forest",
    };
  } catch {
    return { ...defaults };
  }
}

export function saveLocalProfile(userId: string, value: LocalProfile): void {
  window.localStorage.setItem(storageKey(userId), JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(PROFILE_CHANGED_EVENT, { detail: { userId } }));
}

export function profileInitials(displayName: string, email: string): string {
  const tokens = displayName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) return `${tokens[0].charAt(0)}${tokens[tokens.length - 1].charAt(0)}`.toLocaleUpperCase("vi-VN");
  const source = tokens[0] || email.split("@")[0] || "ED";
  return source.slice(0, 2).toLocaleUpperCase("vi-VN");
}
