"use client";

import type { ReactNode } from "react";
import {
  Activity,
  Bell,
  Bookmark,
  BookOpen,
  Brain,
  ClipboardList,
  Coins,
  LineChart,
  Newspaper,
  ScanLine,
  Sparkles,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { WorkflowIconKey } from "@/lib/workflows/definitions";

const ICON_MAP: Record<WorkflowIconKey, LucideIcon> = {
  activity: Activity,
  bell: Bell,
  bookmark: Bookmark,
  "book-open": BookOpen,
  brain: Brain,
  clipboard: ClipboardList,
  coins: Coins,
  "line-chart": LineChart,
  newspaper: Newspaper,
  scan: ScanLine,
  sparkles: Sparkles,
  target: Target,
  wallet: Wallet,
};

export function WorkflowIcon({ iconKey, className }: { iconKey: WorkflowIconKey; className?: string }) {
  const Icon = ICON_MAP[iconKey];
  return <Icon className={className ?? "h-3.5 w-3.5"} aria-hidden />;
}

export function workflowIconNode(iconKey: WorkflowIconKey): ReactNode {
  return <WorkflowIcon iconKey={iconKey} />;
}
