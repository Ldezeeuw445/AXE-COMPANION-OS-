export function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function relativeTime(ts, now = Date.now()) {
  const diff = Math.floor((now - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  const days = Math.floor(diff / 86400);
  if (days < 7) return days + "d ago";
  if (days < 30) return Math.floor(days / 7) + "w ago";
  if (days < 365) return Math.floor(days / 30) + "mo ago";
  return Math.floor(days / 365) + "y ago";
}

export function untilTime(ts, now = Date.now()) {
  const diff = Math.floor((ts - now) / 1000);
  if (diff <= 0) return "now";
  if (diff < 3600) return "in " + Math.floor(diff / 60) + "m";
  if (diff < 86400) return "in " + Math.floor(diff / 3600) + "h";
  const days = Math.floor(diff / 86400);
  return "in " + days + "d";
}

export function clock(ts) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDay(ts, now = Date.now()) {
  const d = new Date(ts);
  const today = new Date(now);
  const diffDays = Math.round(
    (d.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 86400000
  );
  if (diffDays === 0) return "TODAY";
  if (diffDays === 1) return "TOMORROW";
  if (diffDays === -1) return "YESTERDAY";
  return new Date(ts)
    .toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short" })
    .toUpperCase();
}

export const TAG_COLOR = {
  FX: "#4ea1ff",
  Stocks: "#1fbf75",
  Crypto: "#b974ff",
  Macro: "#f5a524",
  Energy: "#e5484d",
  Tech: "#4ea1ff",
  Rates: "#b974ff",
  Commodities: "#f5a524",
};

export const EVENT_COLOR = {
  earnings: "#1fbf75",
  macro: "#f5a524",
  fed: "#b974ff",
  central_bank: "#4ea1ff",
  other: "#7b828a",
};

export const BIAS_COLOR = {
  long: "#1fbf75",
  short: "#e5484d",
  neutral: "#7b828a",
};

export const STATUS_LABEL = {
  draft: "DRAFT",
  live: "LIVE",
  hit_target: "TARGET HIT",
  stopped: "STOPPED",
  closed: "CLOSED",
};

export const STATUS_COLOR = {
  draft: "#7b828a",
  live: "#1fbf75",
  hit_target: "#1fbf75",
  stopped: "#e5484d",
  closed: "#4a4f55",
};
