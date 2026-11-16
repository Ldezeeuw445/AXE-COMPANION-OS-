/**
 * What the background sync should do about a MetaApi account whose terminal is
 * not running.
 *
 * Measured 2026-11-16: every active cloud account had been UNDEPLOYED and
 * DISCONNECTED on MetaApi since about 2026-11-12. MetaApi answers every client
 * call for such an account with a 404, which the sync reported as "The MetaApi
 * account was not found. It may have been deleted" — the account still existed,
 * nothing ever started it again, and `liveAccountState` went stale for four
 * days while the cron kept returning HTTP 200.
 *
 * Starting a terminal is the same call the Test / reconnect buttons already
 * make (`ensureMetaApiAccountDeployment`). Run unattended it needs two limits:
 * it only fires for accounts the trader still has active, and at most once per
 * `AUTO_DEPLOY_MIN_INTERVAL_MS` per account — a MetaApi that keeps undeploying
 * an account (an empty balance does that) must not turn into a deploy every ten
 * minutes.
 */
export const AUTO_DEPLOY_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type DeployAction =
  /** Terminal is up (or its state is unknown): carry on with the sync. */
  | "proceed"
  /** MetaApi is starting or stopping it: do not hammer it, try next run. */
  | "wait"
  /** Undeployed: start it. */
  | "deploy"
  /** Undeployed, but a deploy was already tried recently. */
  | "rate_limited"
  /** Undeployed, and the caller did not allow starting it. */
  | "not_allowed";

export function decideDeployAction(input: {
  state?: string | null;
  allowDeploy: boolean;
  lastAutoDeployAt?: string | null;
  now?: Date;
}): DeployAction {
  const state = String(input.state ?? "").trim().toUpperCase();
  if (state === "UNDEPLOYED" || state === "CREATED") {
    if (!input.allowDeploy) return "not_allowed";
    const last = input.lastAutoDeployAt ? Date.parse(input.lastAutoDeployAt) : NaN;
    const now = (input.now ?? new Date()).getTime();
    if (Number.isFinite(last) && now - last < AUTO_DEPLOY_MIN_INTERVAL_MS) return "rate_limited";
    return "deploy";
  }
  if (state === "DEPLOYING" || state === "UNDEPLOYING" || state === "DELETING") return "wait";
  return "proceed";
}

/** Thrown by the sync when the terminal is not running, so the failure is named, not "not found". */
export class AccountNotRunningError extends Error {
  constructor(
    readonly providerStatus: "undeployed" | "deploying",
    message: string,
  ) {
    super(message);
    this.name = "AccountNotRunningError";
  }
}

export function notRunningMessage(action: DeployAction): string {
  switch (action) {
    case "wait":
      return "The MetaApi terminal is starting or stopping. The next background sync retries it.";
    case "rate_limited":
      return "The MetaApi terminal is undeployed and was already restarted in the last 6 hours. If it keeps stopping, check the MetaApi balance and plan.";
    case "not_allowed":
      return "The MetaApi terminal is undeployed, so no broker data can be read. Reconnect the account.";
    default:
      return "The MetaApi terminal is not running.";
  }
}
