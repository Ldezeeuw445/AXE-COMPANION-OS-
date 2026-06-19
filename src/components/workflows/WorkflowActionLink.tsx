"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { stageChatPrefill } from "@/lib/chat/chatPrefill";
import type { ResolvedWorkflowAction } from "@/lib/workflows/catalog";

export function WorkflowActionLink({
  action,
  className,
  children,
  onNavigate,
}: {
  action: Pick<ResolvedWorkflowAction, "href" | "chatPrompt" | "id">;
  className?: string;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  const router = useRouter();

  if (action.chatPrompt) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          stageChatPrefill(action.chatPrompt!);
          router.push(action.href);
          onNavigate?.();
        }}
      >
        {children}
      </button>
    );
  }

  return (
    <Link href={action.href} className={className} prefetch={false} onClick={onNavigate}>
      {children}
    </Link>
  );
}
