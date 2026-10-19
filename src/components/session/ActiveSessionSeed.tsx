"use client";

import { useLayoutEffect } from "react";
import type { ActiveSessionState } from "@/lib/session/activeSession";
import { patchActiveSession } from "@/lib/session/activeSessionStore";

/**
 * Pages that already loaded user/account/symbol on the server write that
 * into the shared store. LayoutEffect so sibling tabs see it before paint.
 */
export function ActiveSessionSeed(props: Partial<ActiveSessionState>) {
  useLayoutEffect(() => {
    const patch: Partial<ActiveSessionState> = {};
    if (props.userId !== undefined) patch.userId = props.userId;
    if (props.accountId !== undefined) patch.accountId = props.accountId;
    if (props.accountType !== undefined) patch.accountType = props.accountType;
    if (props.accountLabel !== undefined) patch.accountLabel = props.accountLabel;
    if (props.symbol !== undefined) patch.symbol = props.symbol;
    if (props.timeframe !== undefined) patch.timeframe = props.timeframe;
    if (props.lastTab !== undefined) patch.lastTab = props.lastTab;
    if (Object.keys(patch).length === 0) return;
    patchActiveSession(patch);
  }, [
    props.userId,
    props.accountId,
    props.accountType,
    props.accountLabel,
    props.symbol,
    props.timeframe,
    props.lastTab,
  ]);
  return null;
}
