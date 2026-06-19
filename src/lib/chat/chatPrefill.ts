export const CHAT_PREFILL_STORAGE_KEY = "axe.chat.prefill";

/** Stage draft text before navigating to /chat (survives soft nav + layout reuse). */
export function stageChatPrefill(text: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CHAT_PREFILL_STORAGE_KEY, text);
  } catch {
    /* ignore */
  }
}

export function consumeStagedChatPrefill(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(CHAT_PREFILL_STORAGE_KEY);
    if (value) sessionStorage.removeItem(CHAT_PREFILL_STORAGE_KEY);
    return value;
  } catch {
    return null;
  }
}

export function chatHrefWithPrefill(text: string): string {
  return `/chat?q=${encodeURIComponent(text)}`;
}
