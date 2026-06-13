import type { AuthState } from "../types";

export function chatUserKey(user: AuthState["user"]): string | null {
  if (!user || typeof user === "string") {
    return null;
  }
  if (typeof user.id === "string" && user.id.length > 0) {
    return user.id;
  }
  if (typeof user.email === "string" && user.email.length > 0) {
    return `email:${user.email}`;
  }
  return null;
}
