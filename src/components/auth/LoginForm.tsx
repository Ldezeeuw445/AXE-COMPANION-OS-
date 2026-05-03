"use client";

import { useActionState } from "react";
import { hasSupabaseConfig } from "@/lib/env";
import { signInAction } from "@/app/actions/auth";
import { GlassPanel } from "@/components/ui/GlassPanel";

type ActionResult = { error?: string; message?: string } | undefined;

function SubmitButton() {
  return (
    <button
      type="submit"
      className="tos-btn-cyan w-full rounded-2xl py-3 text-sm font-semibold disabled:opacity-50"
    >
      Enter companion
    </button>
  );
}

export function LoginForm() {
  const supabaseConfigured = hasSupabaseConfig();
  const [state, formAction] = useActionState<ActionResult, FormData>(signInAction, undefined);

  return (
    <GlassPanel glow="warm" className="p-6">
      <div>
        <h2 className="text-sm font-bold text-tos-text">Sign in</h2>
        <p className="mt-1 text-xs text-tos-muted">
          Invitation-only. Access is granted by the operator.
        </p>
      </div>

      {supabaseConfigured ? (
        <form action={formAction} className="mt-5 space-y-3">
          <div>
            <label htmlFor="email" className="text-[10px] font-medium uppercase tracking-wider text-tos-dim">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className="tos-neu-inset mt-1 w-full rounded-2xl px-3 py-2.5 text-sm text-tos-text placeholder:text-tos-dim"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="text-[10px] font-medium uppercase tracking-wider text-tos-dim">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              className="tos-neu-inset mt-1 w-full rounded-2xl px-3 py-2.5 text-sm text-tos-text placeholder:text-tos-dim"
              required
            />
          </div>
          {state?.error ? (
            <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400" role="alert">
              {state.error}
            </p>
          ) : null}
          {state?.message ? (
            <p className="rounded-xl bg-green-500/10 px-3 py-2 text-sm font-medium text-green-400" role="alert">
              {state.message}
            </p>
          ) : null}
          <SubmitButton />
        </form>
      ) : (
        <div className="mt-4 space-y-2 text-xs text-tos-muted">
          <p>
            Supabase is not configured. Copy{" "}
            <code className="rounded bg-white/5 px-1 font-mono text-[10px]">.env.local.example</code> to{" "}
            <code className="rounded bg-white/5 px-1 font-mono text-[10px]">.env.local</code> and set{" "}
            <code className="rounded bg-white/5 px-1 font-mono text-[10px]">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
            <code className="rounded bg-white/5 px-1 font-mono text-[10px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, and{" "}
            <code className="rounded bg-white/5 px-1 font-mono text-[10px]">NEXT_PUBLIC_DATA_SOURCE=supabase</code>.
            Then restart <code className="rounded bg-white/5 px-1 font-mono text-[10px]">npm run dev</code>.
          </p>
        </div>
      )}
    </GlassPanel>
  );
}
