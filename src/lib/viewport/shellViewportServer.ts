export const VIEWPORT_COOKIE = "axe.shell-viewport";
export const VIEWPORT_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export type ShellViewport = "phone" | "tablet" | "desktop";

export function parseShellViewport(raw: string | null | undefined): ShellViewport {
  if (raw === "tablet" || raw === "desktop" || raw === "phone") return raw;
  return "phone";
}

export function formatViewportCookie(viewport: ShellViewport): string {
  return `${VIEWPORT_COOKIE}=${viewport}; Path=/; Max-Age=${VIEWPORT_COOKIE_MAX_AGE}; SameSite=Lax`;
}
