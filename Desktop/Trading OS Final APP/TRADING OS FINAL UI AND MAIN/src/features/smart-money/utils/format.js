export function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function relativeTime(ts, now = Date.now()) {
  const diff = Math.floor((now - ts) / 1000);
  if (diff < 60) return diff + "s";
  if (diff < 3600) return Math.floor(diff / 60) + "m";
  if (diff < 86400) return Math.floor(diff / 3600) + "h";
  return Math.floor(diff / 86400) + "d";
}

export function formatNotional(v) {
  if (!v || v <= 0) return "—";
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
  return "$" + v.toFixed(0);
}

export const CHANNEL_LABEL = {
  politician: "POL",
  insider: "INS",
  whale: "WHL",
  dark_pool: "DPL",
  options: "OPT",
  jet: "JET",
  vessel: "VSL",
  news: "NWS",
};

export const CHANNEL_COLOR = {
  politician: "#4ea1ff",
  insider: "#f5a524",
  whale: "#b974ff",
  dark_pool: "#7b828a",
  options: "#1fbf75",
  jet: "#4ea1ff",
  vessel: "#4ea1ff",
  news: "#b974ff",
};

export const DIRECTION_COLOR = {
  bullish: "#1fbf75",
  bearish: "#e5484d",
  neutral: "#7b828a",
};
