/**
 * The shape of anything AXE says first.
 *
 * Luka's requirement, in his words: every message should immediately say
 * "wat je er aan hebt en wat je er mee kan" — what it means for you, and what
 * you can do with it. Before this, nearly every proactive notice said only
 * what had happened:
 *
 *   "Trade closed: XAUUSD"  →  "buy +120.50 — cockpit & journal updated"
 *
 * True, and useless at 3am on a phone. It does not say whether that was a
 * good trade, what it does to the day, or where to go next. A notification
 * that cannot be acted on teaches the trader to swipe the next one away, and
 * then the one that mattered goes with it.
 *
 * So a notice is three parts, and the type will not let a producer skip the
 * last two:
 *
 *   what    — the fact. One line, numbers included.
 *   soWhat  — what it means for this trader, from their own data.
 *   action  — the one next thing, with where it goes.
 *
 * `soWhat` may be null, and that is deliberate rather than a loophole: when
 * there is nothing true to add, padding it with "this may be important" is
 * worse than leaving it out. What is never optional is the action — the notice
 * already carries a URL, so there is always somewhere to go, and a notice
 * with nowhere to go should not have been sent.
 *
 * Dependency-free: the verify suite exercises it directly.
 */

export type NoticeAction = {
  /** Imperative, in the trader's words. "Approve or discard", not "View". */
  label: string;
  /** In-app path. The feed and the push both tap through to it. */
  href: string;
};

export type ProactiveNotice = {
  title: string;
  what: string;
  /** Null only when there is genuinely nothing honest to add. */
  soWhat: string | null;
  action: NoticeAction;
};

/** Longest body a push notification shows before the OS truncates it. */
export const MAX_NOTICE_BODY = 240;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * One body string, for the feed row and the push alike.
 *
 * Parts are joined with " · " rather than newlines: Android collapses a
 * notification to one line and iOS to two, so a newline buys nothing and
 * costs the action on the line that gets cut. The action goes last because
 * it is the part the trader is being asked to keep.
 *
 * Capped: an OS that truncates mid-word is one thing, but it truncates from
 * the end, which would drop exactly the part that says what to do. So when it
 * does not fit, `soWhat` is what gives way — the action survives.
 */
export function renderNoticeBody(notice: ProactiveNotice): string {
  const what = clean(notice.what);
  const soWhat = notice.soWhat ? clean(notice.soWhat) : "";
  const action = clean(notice.action.label);

  const full = [what, soWhat, action].filter(Boolean).join(" · ");
  if (full.length <= MAX_NOTICE_BODY) return full;

  const withoutSoWhat = [what, action].filter(Boolean).join(" · ");
  if (withoutSoWhat.length <= MAX_NOTICE_BODY) return withoutSoWhat;

  // Even the fact plus the action is too long. Trim the fact, never the
  // action: a notice that says what to do about something unnamed is still
  // usable, one that names something with no next step is not.
  const room = MAX_NOTICE_BODY - action.length - 3;
  if (room <= 0) return action.slice(0, MAX_NOTICE_BODY);
  return `${what.slice(0, room).trimEnd()} · ${action}`;
}

/**
 * What is missing from a notice, in plain words.
 *
 * Used by the verify suite rather than at runtime: the type already stops a
 * producer omitting the action, and this catches the version that satisfies
 * the type with empty strings.
 */
export function noticeGaps(notice: ProactiveNotice): string[] {
  const gaps: string[] = [];
  if (!clean(notice.title)) gaps.push("no title");
  if (!clean(notice.what)) gaps.push("does not say what happened");
  if (!clean(notice.action.label)) gaps.push("does not say what to do");
  if (!notice.action.href.startsWith("/")) gaps.push("action does not point anywhere in the app");
  // "View" and "Open" are what a notice says when nobody decided what the
  // trader should actually do with it.
  if (/^(view|open|see|check|more|details?)$/i.test(clean(notice.action.label))) {
    gaps.push(`action label "${notice.action.label}" is a shrug, not an instruction`);
  }
  return gaps;
}

/** A money amount the way a trader reads it, sign included. */
export function signedAmount(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
}
