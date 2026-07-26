const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;

export function sanitizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, USERNAME_MAX_LENGTH);
}

export function isValidUsername(username: string): boolean {
  return (
    username.length >= USERNAME_MIN_LENGTH &&
    username.length <= USERNAME_MAX_LENGTH &&
    /^[a-z0-9._]+$/.test(username)
  );
}

export function suggestUsernameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const sanitized = sanitizeUsername(localPart);
  if (sanitized.length >= USERNAME_MIN_LENGTH) return sanitized;
  return `nutzer${Math.floor(1000 + Math.random() * 9000)}`;
}

export function withRandomSuffix(base: string): string {
  const suffix = String(Math.floor(100 + Math.random() * 900));
  const truncatedBase = base.slice(0, USERNAME_MAX_LENGTH - suffix.length);
  return `${truncatedBase}${suffix}`;
}
