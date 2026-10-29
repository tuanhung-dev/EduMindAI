export const passwordRules = [
  { label: "10 ký tự trở lên", test: (s: string) => s.length >= 10 },
  { label: "Chữ hoa", test: (s: string) => /[A-Z]/.test(s) },
  { label: "Chữ thường", test: (s: string) => /[a-z]/.test(s) },
  { label: "Chữ số", test: (s: string) => /\d/.test(s) },
  { label: "Ký tự đặc biệt", test: (s: string) => /[^A-Za-z0-9]/.test(s) },
];
export const isStrongPassword = (value: string) => passwordRules.every(rule => rule.test(value));
export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
