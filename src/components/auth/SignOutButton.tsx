"use client";

import { signOutAction } from "@/app/actions/auth";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="w-full rounded-xl border border-tos-border py-3 text-sm font-medium text-tos-muted transition-colors hover:bg-white/5 disabled:opacity-50"
      >
        Sign out
      </button>
    </form>
  );
}
