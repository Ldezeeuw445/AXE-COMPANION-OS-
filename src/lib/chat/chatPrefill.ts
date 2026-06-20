export const CHAT_PREFILL_STORAGE_KEY = "axe.chat.prefill";
export const CHAT_PREFILL_EVENT = "axe:chat-prefill";

/** Stage draft text before navigating to /chat (survives soft nav + layout reuse). */
export function stageChatPrefill(text: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CHAT_PREFILL_STORAGE_KEY, text);
  } catch {
    /* ignore */
  }
}

/** Read staged draft without removing — safe for Strict Mode double-mount. */
export function readStagedChatPrefill(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(CHAT_PREFILL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearStagedChatPrefill(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CHAT_PREFILL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function consumeStagedChatPrefill(): string | null {
  const value = readStagedChatPrefill();
  if (value) clearStagedChatPrefill();
  return value;
}

export function chatHrefWithPrefill(text: string): string {
  return `/chat?q=${encodeURIComponent(text)}`;
}

/** Stage + broadcast so Composer fills even when already mounted on /chat. */
export function applyChatPrefill(text: string): void {
  stageChatPrefill(text);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHAT_PREFILL_EVENT, { detail: { text } }));
}
